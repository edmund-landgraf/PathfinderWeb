import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getPool, sql } from '../src/db.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', '..', 'docs');
const dotPath = path.join(outDir, 'pf2-schema.dot');
const pngPath = path.join(outDir, 'pf2-schema.png');

const SCHEMA = 'pf2';

const COLUMN_TARGETS = {
  FamilyId: { table: 'MonsterFamily', column: 'FamilyId' },
  SizeId: { table: 'SizeCategory', column: 'SizeId' },
  SourcePurchaseID: { table: 'SourceBookPurchase', column: 'SourceBookPurchaseId' },
  SourcePurchaseId: { table: 'SourceBookPurchase', column: 'SourceBookPurchaseId' },
  SpellcastingId: { table: 'MonsterSpellcasting', column: 'SpellcastingId' }
};

function escapeDotLabel(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function buildPkOwners(pkByTable) {
  const owners = new Map();

  for (const [tableName, pkCols] of pkByTable.entries()) {
    for (const columnName of pkCols) {
      const key = columnName.toLowerCase();
      if (!owners.has(key)) owners.set(key, []);
      owners.get(key).push({ table: tableName, column: columnName });
    }
  }

  return owners;
}

function resolveLogicalTarget(columnName, sourceTable, tableNames, pkByTable, pkOwners) {
  if (COLUMN_TARGETS[columnName]) {
    return COLUMN_TARGETS[columnName];
  }

  const owners = pkOwners.get(columnName.toLowerCase()) || [];
  if (owners.length === 1) {
    return owners[0];
  }

  if (owners.length > 1) {
    const stem = columnName.replace(/Id$/i, '');
    const exact = owners.find((owner) => owner.table === stem);
    if (exact) return exact;
    const external = owners.find((owner) => owner.table !== sourceTable);
    if (external) return external;
    return owners[0];
  }

  const match = columnName.match(/^(.+?)(Id|ID)$/);
  if (!match) return null;

  const stem = match[1];
  if (!tableNames.has(stem)) return null;

  const pkCols = pkByTable.get(stem) || [];
  if (pkCols.length === 1) {
    return { table: stem, column: pkCols[0] };
  }

  const sameName = pkCols.find((pk) => pk.toLowerCase() === columnName.toLowerCase());
  if (sameName) {
    return { table: stem, column: sameName };
  }

  return null;
}

function inferLogicalForeignKeys({ tables, columns, pkByTable, foreignKeys }) {
  const tableNames = new Set(tables);
  const pkOwners = buildPkOwners(pkByTable);
  const declaredKeys = new Set(
    foreignKeys.map(
      (fk) => `${fk.SRC_TABLE}.${fk.SRC_COLUMN}->${fk.TGT_TABLE}.${fk.TGT_COLUMN}`.toLowerCase()
    )
  );
  const pkColumns = new Set();
  for (const [tableName, pkCols] of pkByTable.entries()) {
    for (const pkCol of pkCols) {
      pkColumns.add(`${tableName}.${pkCol}`.toLowerCase());
    }
  }

  const inferred = [];

  for (const column of columns) {
    const sourceKey = `${column.TABLE_NAME}.${column.COLUMN_NAME}`.toLowerCase();
    if (pkColumns.has(sourceKey)) continue;

    const target = resolveLogicalTarget(
      column.COLUMN_NAME,
      column.TABLE_NAME,
      tableNames,
      pkByTable,
      pkOwners
    );
    if (!target) continue;
    if (column.TABLE_NAME === target.table) continue;

    const relKey = `${column.TABLE_NAME}.${column.COLUMN_NAME}->${target.table}.${target.column}`.toLowerCase();
    if (declaredKeys.has(relKey)) continue;

    inferred.push({
      SRC_TABLE: column.TABLE_NAME,
      SRC_COLUMN: column.COLUMN_NAME,
      TGT_TABLE: target.table,
      TGT_COLUMN: target.column
    });
  }

  return inferred;
}

function buildEffectivePkColumns(columns, pkColumns) {
  const effective = new Set(pkColumns);

  const columnsByTable = new Map();
  for (const column of columns) {
    if (!columnsByTable.has(column.TABLE_NAME)) {
      columnsByTable.set(column.TABLE_NAME, []);
    }
    columnsByTable.get(column.TABLE_NAME).push(column);
  }

  for (const [tableName, tableColumns] of columnsByTable.entries()) {
    const hasPk = tableColumns.some((column) =>
      effective.has(`${tableName}.${column.COLUMN_NAME}`)
    );
    if (hasPk) continue;

    const identityCols = tableColumns.filter((column) => column.is_identity);
    if (identityCols.length === 1) {
      effective.add(`${tableName}.${identityCols[0].COLUMN_NAME}`);
    }
  }

  return effective;
}

function columnSuffix(column, pkColumns, declaredFkColumns, inferredFkColumns) {
  const key = `${column.TABLE_NAME}.${column.COLUMN_NAME}`;
  if (pkColumns.has(key)) return ' PK';
  if (declaredFkColumns.has(key)) return ' FK';
  if (inferredFkColumns.has(key)) return ' FK*';
  return '';
}

async function loadSchemaMetadata(pool) {
  const tablesResult = await pool.request().query(`
    SELECT t.name AS TableName
    FROM sys.tables t
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE s.name = '${SCHEMA}'
    ORDER BY t.name;
  `);

  const columnsResult = await pool.request().query(`
    SELECT
      t.name AS TABLE_NAME,
      c.name AS COLUMN_NAME,
      ty.name AS DATA_TYPE,
      c.max_length,
      c.precision,
      c.scale,
      c.is_nullable,
      c.is_identity,
      c.column_id
    FROM sys.columns c
    INNER JOIN sys.tables t ON t.object_id = c.object_id
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
    INNER JOIN sys.types ty ON ty.user_type_id = c.user_type_id
    WHERE s.name = '${SCHEMA}'
    ORDER BY t.name, c.column_id;
  `);

  const pkResult = await pool.request().query(`
    SELECT
      t.name AS TABLE_NAME,
      c.name AS COLUMN_NAME
    FROM sys.indexes i
    INNER JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    INNER JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    INNER JOIN sys.tables t ON t.object_id = i.object_id
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.is_primary_key = 1
      AND s.name = '${SCHEMA}';
  `);

  const fkResult = await pool.request().query(`
    SELECT
      src_t.name AS SRC_TABLE,
      src_c.name AS SRC_COLUMN,
      tgt_t.name AS TGT_TABLE,
      tgt_c.name AS TGT_COLUMN,
      fk.name AS FK_NAME
    FROM sys.foreign_keys fk
    INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
    INNER JOIN sys.tables src_t ON src_t.object_id = fk.parent_object_id
    INNER JOIN sys.schemas src_s ON src_s.schema_id = src_t.schema_id
    INNER JOIN sys.columns src_c
      ON src_c.object_id = fkc.parent_object_id
     AND src_c.column_id = fkc.parent_column_id
    INNER JOIN sys.tables tgt_t ON tgt_t.object_id = fk.referenced_object_id
    INNER JOIN sys.schemas tgt_s ON tgt_s.schema_id = tgt_t.schema_id
    INNER JOIN sys.columns tgt_c
      ON tgt_c.object_id = fkc.referenced_object_id
     AND tgt_c.column_id = fkc.referenced_column_id
    WHERE src_s.name = '${SCHEMA}'
      AND tgt_s.name = '${SCHEMA}'
    ORDER BY src_t.name, fk.name, fkc.constraint_column_id;
  `);

  const tables = tablesResult.recordset.map((row) => row.TableName);
  const columns = columnsResult.recordset;
  const pkByTable = new Map();
  for (const row of pkResult.recordset) {
    if (!pkByTable.has(row.TABLE_NAME)) pkByTable.set(row.TABLE_NAME, []);
    pkByTable.get(row.TABLE_NAME).push(row.COLUMN_NAME);
  }

  const foreignKeys = fkResult.recordset;
  const inferredForeignKeys = inferLogicalForeignKeys({
    tables,
    columns,
    pkByTable,
    foreignKeys
  });

  return {
    tables,
    columns,
    pkByTable,
    pkColumns: buildEffectivePkColumns(
      columns,
      new Set(pkResult.recordset.map((row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}`))
    ),
    foreignKeys,
    inferredForeignKeys
  };
}

function formatDataType(column) {
  const type = column.DATA_TYPE.toLowerCase();
  if (['nvarchar', 'varchar', 'char', 'nchar', 'varbinary', 'binary'].includes(type)) {
    const len = column.max_length;
    if (len === -1) return `${type}(max)`;
    const displayLen = type.startsWith('n') ? Math.floor(len / 2) : len;
    return `${type}(${displayLen})`;
  }
  if (['decimal', 'numeric'].includes(type)) {
    return `${type}(${column.precision},${column.scale})`;
  }
  return type;
}

function buildDot({ tables, columns, pkColumns, foreignKeys, inferredForeignKeys }) {
  const columnsByTable = new Map();
  for (const column of columns) {
    if (!columnsByTable.has(column.TABLE_NAME)) {
      columnsByTable.set(column.TABLE_NAME, []);
    }
    columnsByTable.get(column.TABLE_NAME).push(column);
  }

  const declaredFkColumns = new Set(
    foreignKeys.map((fk) => `${fk.SRC_TABLE}.${fk.SRC_COLUMN}`)
  );
  const inferredFkColumns = new Set(
    inferredForeignKeys.map((fk) => `${fk.SRC_TABLE}.${fk.SRC_COLUMN}`)
  );

  const tableGroups = {
    lookup: new Set(['Alignment', 'Rarity', 'SizeCategory', 'Tradition', 'Trait', 'MonsterFamily']),
    source: new Set(['SourceBook', 'SourceBookPurchase']),
    monster: new Set([
      'Monster',
      'MonsterAbility',
      'MonsterAttack',
      'MonsterSpell',
      'MonsterSpellcasting',
      'MonsterStats',
      'MonsterTrait',
      'MonsterSourceLink',
      'MonsterImportLog'
    ]),
    spell: new Set([
      'Spell',
      'SpellTrait',
      'SpellTradition',
      'SpellSourceLink',
      'SpellImportLog'
    ]),
    feat: new Set(['Feat', 'FeatTrait', 'FeatSourceLink', 'FeatImportLog']),
    equipment: new Set(['Equipment', 'EquipmentTrait', 'EquipmentSourceLink', 'EquipmentImportLog'])
  };

  const lines = [
    'digraph pf2_schema {',
    '  graph [',
    '    rankdir=LR,',
    '    bgcolor="#f8fafc",',
    '    pad="0.4",',
    '    splines=ortho,',
    '    nodesep=0.35,',
    '    ranksep=1.0,',
    '    fontname="Segoe UI",',
    '    fontsize=11,',
    `    label="PathfinderUtil :: pf2 schema\\n${foreignKeys.length} enforced FKs (solid) + ${inferredForeignKeys.length} logical FKs (dashed)\\nFK* = logical only (no DB constraint)",`,
    '    labelloc=t,',
    '    fontsize=16',
    '  ];',
    '  node [',
    '    shape=plaintext,',
    '    fontname="Consolas",',
    '    fontsize=10',
    '  ];',
    '  edge [',
    '    color="#64748b",',
    '    arrowsize=0.7,',
    '    penwidth=1.0,',
    '    fontname="Segoe UI",',
    '    fontsize=9',
    '  ];',
    ''
  ];

  for (const [groupName, groupTables] of Object.entries(tableGroups)) {
    lines.push(`  subgraph cluster_${groupName} {`);
    lines.push(`    label="${groupName.charAt(0).toUpperCase() + groupName.slice(1)}";`);
    lines.push('    style=rounded;');
    lines.push('    color="#cbd5e1";');
    lines.push('    bgcolor="#ffffff";');
    lines.push('    fontname="Segoe UI";');
    lines.push('    fontsize=12;');

    for (const tableName of tables.filter((name) => groupTables.has(name))) {
      const tableColumns = columnsByTable.get(tableName) || [];
      const labelRows = tableColumns.map((column) => {
        const suffix = columnSuffix(column, pkColumns, declaredFkColumns, inferredFkColumns);
        const nullable = column.is_nullable ? '' : ' NOT NULL';
        const identity = column.is_identity ? ' IDENTITY' : '';
        return `${escapeDotLabel(column.COLUMN_NAME)} : ${formatDataType(column)}${suffix}${nullable}${identity}`;
      });

      lines.push(`    "${tableName}" [`);
      lines.push('      label=<');
      lines.push('        <TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="4" BGCOLOR="#ffffff">');
      lines.push(`          <TR><TD BGCOLOR="#1e293b" ALIGN="LEFT"><FONT COLOR="#ffffff"><B>${escapeDotLabel(tableName)}</B></FONT></TD></TR>`);

      for (const row of labelRows) {
        lines.push(`          <TR><TD ALIGN="LEFT">${row}</TD></TR>`);
      }

      lines.push('        </TABLE>');
      lines.push('      >');
      lines.push('    ];');
    }

    lines.push('  }');
    lines.push('');
  }

  const grouped = new Set(Object.values(tableGroups).flatMap((set) => [...set]));
  const ungrouped = tables.filter((name) => !grouped.has(name));
  if (ungrouped.length) {
    lines.push('  subgraph cluster_other {');
    lines.push('    label="Other";');
    lines.push('    style=rounded;');
    lines.push('    color="#cbd5e1";');
    lines.push('    bgcolor="#ffffff";');

    for (const tableName of ungrouped) {
      const tableColumns = columnsByTable.get(tableName) || [];
      const labelRows = tableColumns.map((column) => {
        const suffix = columnSuffix(column, pkColumns, declaredFkColumns, inferredFkColumns);
        return `${escapeDotLabel(column.COLUMN_NAME)} : ${formatDataType(column)}${suffix}`;
      });

      lines.push(`    "${tableName}" [`);
      lines.push('      label=<');
      lines.push('        <TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="4" BGCOLOR="#ffffff">');
      lines.push(`          <TR><TD BGCOLOR="#334155" ALIGN="LEFT"><FONT COLOR="#ffffff"><B>${escapeDotLabel(tableName)}</B></FONT></TD></TR>`);
      for (const row of labelRows) {
        lines.push(`          <TR><TD ALIGN="LEFT">${row}</TD></TR>`);
      }
      lines.push('        </TABLE>');
      lines.push('      >');
      lines.push('    ];');
    }

    lines.push('  }');
    lines.push('');
  }

  for (const fk of foreignKeys) {
    lines.push(
      `  "${fk.SRC_TABLE}" -> "${fk.TGT_TABLE}" [color="#334155", penwidth=1.4, label="${escapeDotLabel(`${fk.SRC_COLUMN} → ${fk.TGT_COLUMN}`)}"];`
    );
  }

  for (const fk of inferredForeignKeys) {
    lines.push(
      `  "${fk.SRC_TABLE}" -> "${fk.TGT_TABLE}" [color="#94a3b8", style=dashed, penwidth=1.1, label="${escapeDotLabel(`${fk.SRC_COLUMN} → ${fk.TGT_COLUMN}`)}"];`
    );
  }

  lines.push('}');
  return lines.join('\n');
}

async function renderDotToPng(dotFile, pngFile) {
  const dotCandidates = [
    'dot',
    'C:\\Program Files\\Graphviz\\bin\\dot.exe',
    'C:\\Program Files (x86)\\Graphviz\\bin\\dot.exe'
  ];

  for (const dotCmd of dotCandidates) {
    try {
      await execFileAsync(dotCmd, ['-Tpng', '-Gdpi=110', dotFile, '-o', pngFile]);
      return dotCmd;
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    'Graphviz "dot" is not installed. Install Graphviz and ensure dot is on PATH, then re-run this script.'
  );
}

async function main() {
  const pool = await getPool();
  const metadata = await loadSchemaMetadata(pool);
  const dot = buildDot(metadata);

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(dotPath, dot, 'utf8');
  console.log(`Wrote ${dotPath}`);
  console.log(`Tables: ${metadata.tables.length}`);
  console.log(`Enforced foreign keys: ${metadata.foreignKeys.length}`);
  console.log(`Logical foreign keys: ${metadata.inferredForeignKeys.length}`);
  console.log(`Total relationships: ${metadata.foreignKeys.length + metadata.inferredForeignKeys.length}`);

  await renderDotToPng(dotPath, pngPath);
  console.log(`Wrote ${pngPath}`);

  const libraryPngPath = path.join(__dirname, '..', '..', 'images', 'dbschema.png');
  await fs.mkdir(path.dirname(libraryPngPath), { recursive: true });
  await fs.copyFile(pngPath, libraryPngPath);
  console.log(`Wrote ${libraryPngPath}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
