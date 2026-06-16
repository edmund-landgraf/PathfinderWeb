import { getPool } from '../src/db.js';

const SCHEMA = 'pf2';

const TABLE_ALIASES = {
  FamilyId: { table: 'MonsterFamily', column: 'FamilyId' },
  SizeId: { table: 'SizeCategory', column: 'SizeId' },
  SourcePurchaseID: { table: 'SourceBookPurchase', column: 'SourceBookPurchaseId' },
  SourcePurchaseId: { table: 'SourceBookPurchase', column: 'SourceBookPurchaseId' }
};

function resolveTarget(tableNames, pkByTable, columnName) {
  if (TABLE_ALIASES[columnName]) {
    return TABLE_ALIASES[columnName];
  }

  const match = columnName.match(/^(.+?)(Id|ID)$/);
  if (!match) return null;

  const base = match[1];
  const candidates = [
    { table: base, column: columnName },
    { table: base, column: `${base}Id` },
    { table: base, column: `${base}ID` },
    { table: `${base}Category`, column: columnName.replace(base, `${base}Category`).replace(/CategoryId$/, 'Id') }
  ];

  for (const candidate of candidates) {
    if (!tableNames.has(candidate.table)) continue;
    const pkCols = pkByTable.get(candidate.table) || [];
    if (pkCols.includes(candidate.column)) {
      return { table: candidate.table, column: candidate.column };
    }
    if (pkCols.length === 1 && pkCols[0].toLowerCase() === columnName.toLowerCase()) {
      return { table: candidate.table, column: pkCols[0] };
    }
  }

  if (tableNames.has(base)) {
    const pkCols = pkByTable.get(base) || [];
    if (pkCols.length === 1) {
      return { table: base, column: pkCols[0] };
    }
  }

  return null;
}

async function main() {
  const pool = await getPool();

  const tables = await pool.request().query(`
    SELECT t.name AS TableName
    FROM sys.tables t
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE s.name = '${SCHEMA}'
    ORDER BY t.name
  `);

  const cols = await pool.request().query(`
    SELECT t.name AS TABLE_NAME, c.name AS COLUMN_NAME, c.is_identity, ic.is_primary_key
    FROM sys.columns c
    INNER JOIN sys.tables t ON t.object_id = c.object_id
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
    LEFT JOIN sys.index_columns ixc
      ON ixc.object_id = c.object_id
     AND ixc.column_id = c.column_id
    LEFT JOIN sys.indexes ic
      ON ic.object_id = ixc.object_id
     AND ic.index_id = ixc.index_id
     AND ic.is_primary_key = 1
    WHERE s.name = '${SCHEMA}'
    ORDER BY t.name, c.column_id
  `);

  const fks = await pool.request().query(`
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
    ORDER BY src_t.name, src_c.name
  `);

  const tableNames = new Set(tables.recordset.map((row) => row.TableName));
  const pkByTable = new Map();
  for (const row of cols.recordset) {
    if (!row.is_primary_key) continue;
    if (!pkByTable.has(row.TABLE_NAME)) pkByTable.set(row.TABLE_NAME, []);
    pkByTable.get(row.TABLE_NAME).push(row.COLUMN_NAME);
  }

  const declaredKeys = new Set(
    fks.recordset.map((row) => `${row.SRC_TABLE}.${row.SRC_COLUMN}->${row.TGT_TABLE}.${row.TGT_COLUMN}`)
  );

  const inferred = [];
  for (const col of cols.recordset) {
    if (col.is_primary_key) continue;
    const target = resolveTarget(tableNames, pkByTable, col.COLUMN_NAME);
    if (!target) continue;
    if (col.TABLE_NAME === target.table) continue;

    const key = `${col.TABLE_NAME}.${col.COLUMN_NAME}->${target.table}.${target.column}`;
    if (declaredKeys.has(key)) continue;

    inferred.push({
      SRC_TABLE: col.TABLE_NAME,
      SRC_COLUMN: col.COLUMN_NAME,
      TGT_TABLE: target.table,
      TGT_COLUMN: target.column
    });
  }

  const connected = new Set();
  for (const row of [...fks.recordset, ...inferred]) {
    connected.add(row.SRC_TABLE);
    connected.add(row.TGT_TABLE);
  }

  console.log(`Tables: ${tables.recordset.length}`);
  console.log(`Declared FKs: ${fks.recordset.length}`);
  console.log(`Inferred FKs: ${inferred.length}`);
  console.log(`Total relationships: ${fks.recordset.length + inferred.length}`);

  console.log('\nInferred relationships:');
  for (const row of inferred) {
    console.log(`  ${row.SRC_TABLE}.${row.SRC_COLUMN} -> ${row.TGT_TABLE}.${row.TGT_COLUMN}`);
  }

  console.log('\nTables with no relationships:');
  for (const row of tables.recordset) {
    if (!connected.has(row.TableName)) {
      console.log(`  ${row.TableName}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
