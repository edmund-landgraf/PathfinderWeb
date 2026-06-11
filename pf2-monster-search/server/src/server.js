import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getPool, sql } from './db.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3333);

app.use(cors());
app.use(express.json());

const DEBUG_SQL =
  String(process.env.DEBUG_SQL || 'true').toLowerCase() === 'true';

const allowedSortColumns = new Set([
  'Name',
  'Level',
  'Rarity',
  'Size',
  'Alignment',
  'Family',
  'SourceBook',
  'HP',
  'AC',
  'Fortitude',
  'Reflex',
  'Will',
  'Perception'
]);

const allowedSpellSortColumns = new Set([
  'Name',
  'Rank',
  'SpellType',
  'Rarity',
  'SourceBook',
  'Traditions',
  'Traits',
  'Actions',
  'Defense',
  'Duration'
]);

const allowedFeatSortColumns = new Set([
  'Name',
  'Level',
  'FeatType',
  'Rarity',
  'SourceBook',
  'Traits',
  'PFS',
  'IsStandardAncestryFeat'
]);

const allowedEquipmentSortColumns = new Set([
  'Name',
  'Level',
  'EquipmentType',
  'SearchCategory',
  'ItemCategory',
  'ItemSubcategory',
  'Rarity',
  'SourceBook',
  'Traits',
  'PriceCp',
  'BulkValue',
  'WeaponCategory',
  'ArmorCategory'
]);

function logSection(title) {
  if (!DEBUG_SQL) return;
  console.log('\n' + '='.repeat(100));
  console.log(title);
  console.log('='.repeat(100));
}

function logValue(label, value) {
  if (!DEBUG_SQL) return;
  console.log(label, value);
}

function logError(err) {
  console.error('\n' + '!'.repeat(100));
  console.error('ERROR');
  console.error('!'.repeat(100));
  console.error('Message:', err.message);
  console.error('Name:', err.name);
  console.error('Code:', err.code);
  console.error('Number:', err.number);
  console.error('State:', err.state);
  console.error('Class:', err.class);
  console.error('LineNumber:', err.lineNumber);
  console.error('ServerName:', err.serverName);
  console.error('ProcName:', err.procName);

  if (err.originalError) {
    console.error('OriginalError:', err.originalError);
  }

  if (err.precedingErrors) {
    console.error('PrecedingErrors:', err.precedingErrors);
  }

  console.error('Stack:', err.stack);
}

function normalizeSortBy(value) {
  if (!value) return 'Name';
  const clean = String(value).trim();
  return allowedSortColumns.has(clean) ? clean : 'Name';
}

function normalizeSpellSortBy(value) {
  if (!value) return 'Name';
  const clean = String(value).trim();
  return allowedSpellSortColumns.has(clean) ? clean : 'Name';
}

function normalizeFeatSortBy(value) {
  if (!value) return 'Name';
  const clean = String(value).trim();
  return allowedFeatSortColumns.has(clean) ? clean : 'Name';
}

function normalizeEquipmentSortBy(value) {
  if (!value) return 'Name';
  const clean = String(value).trim();
  return allowedEquipmentSortColumns.has(clean) ? clean : 'Name';
}

function normalizeSortDir(value) {
  return String(value || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
}

function buildOrderBy(sortBy, sortDir) {
  const parts = [];

  parts.push(`${sortBy} ${sortDir}`);

  // Tie-breaker. Do not duplicate the selected sort column.
  if (sortBy !== 'Name') {
    parts.push('Name ASC');
  }

  // Final deterministic tie-breaker.
  if (sortBy !== 'MonsterId') {
    parts.push('MonsterId ASC');
  }

  return parts.join(', ');
}

function buildSpellOrderBy(sortBy, sortDir) {
  const sortExpressions = {
    Name: 's.Name',
    Rank: 's.Rank',
    SpellType: 's.SpellType',
    Rarity: 'r.Name',
    SourceBook: 'sb.Name',
    Traditions: 'traditions.Traditions',
    Traits: 'traits.Traits',
    Actions: 's.Actions',
    Defense: 's.Defense',
    Duration: 's.Duration'
  };

  const expression = sortExpressions[sortBy] || 's.Name';
  const parts = [`${expression} ${sortDir}`];

  if (sortBy !== 'Name') {
    parts.push('s.Name ASC');
  }

  parts.push('s.SpellId ASC');

  return parts.join(', ');
}

function buildFeatOrderBy(sortBy, sortDir) {
  const sortExpressions = {
    Name: 'f.Name',
    Level: 'f.Level',
    FeatType: 'f.FeatType',
    Rarity: 'r.Name',
    SourceBook: 'sb.Name',
    Traits: 'traits.Traits',
    PFS: 'f.PFS',
    IsStandardAncestryFeat: 'f.IsStandardAncestryFeat'
  };

  const expression = sortExpressions[sortBy] || 'f.Name';
  const parts = [`${expression} ${sortDir}`];

  if (sortBy !== 'Name') {
    parts.push('f.Name ASC');
  }

  parts.push('f.FeatId ASC');

  return parts.join(', ');
}

function buildEquipmentOrderBy(sortBy, sortDir) {
  const sortExpressions = {
    Name: 'e.Name',
    Level: 'e.Level',
    EquipmentType: 'e.EquipmentType',
    SearchCategory: 'e.SearchCategory',
    ItemCategory: 'e.ItemCategory',
    ItemSubcategory: 'e.ItemSubcategory',
    Rarity: 'r.Name',
    SourceBook: 'sb.Name',
    Traits: 'traits.Traits',
    PriceCp: 'e.PriceCp',
    BulkValue: 'e.BulkValue',
    WeaponCategory: 'e.WeaponCategory',
    ArmorCategory: 'e.ArmorCategory'
  };

  const expression = sortExpressions[sortBy] || 'e.Name';
  const parts = [`${expression} ${sortDir}`];

  if (sortBy !== 'Name') {
    parts.push('e.Name ASC');
  }

  parts.push('e.EquipmentId ASC');

  return parts.join(', ');
}

function addStringFilter(request, where, debugParams, column, paramName, value, exact = false) {
  if (value === undefined || value === null || String(value).trim() === '') return;

  const clean = String(value).trim();
  const sqlValue = exact ? clean : `%${clean}%`;

  request.input(paramName, sql.NVarChar, sqlValue);

  where.push(exact ? `${column} = @${paramName}` : `${column} LIKE @${paramName}`);

  debugParams[paramName] = {
    type: 'NVarChar',
    value: sqlValue,
    original: clean,
    column,
    exact
  };
}

function addIntFilter(request, where, debugParams, column, paramName, value, operator) {
  if (value === undefined || value === null || String(value).trim() === '') return;

  const n = Number(value);

  if (!Number.isInteger(n)) {
    debugParams[paramName] = {
      skipped: true,
      reason: 'not an integer',
      value
    };
    return;
  }

  request.input(paramName, sql.Int, n);
  where.push(`${column} ${operator} @${paramName}`);

  debugParams[paramName] = {
    type: 'Int',
    value: n,
    column,
    operator
  };
}

function addBoolFilter(request, where, debugParams, column, paramName, value) {
  if (value === undefined || value === null || value === '') return;

  const normalized = String(value).toLowerCase();

  if (!['true', 'false', '1', '0'].includes(normalized)) {
    debugParams[paramName] = {
      skipped: true,
      reason: 'not a boolean',
      value
    };
    return;
  }

  const bit = normalized === 'true' || normalized === '1' ? 1 : 0;

  request.input(paramName, sql.Bit, bit);
  where.push(`${column} = @${paramName}`);

  debugParams[paramName] = {
    type: 'Bit',
    value: bit,
    column
  };
}

app.get('/api/health', async (_req, res) => {
  const started = Date.now();

  try {
    logSection('GET /api/health');

    const pool = await getPool();
    const result = await pool.request().query('SELECT 1 AS ok');

    logValue('Health result:', result.recordset);

    res.json({
      ok: true,
      db: result.recordset[0].ok === 1,
      elapsedMs: Date.now() - started
    });
  } catch (err) {
    logError(err);
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

app.get('/api/lookups', async (_req, res) => {
  const started = Date.now();

  try {
    logSection('GET /api/lookups');

    const pool = await getPool();

    const lookupSql = `
      SELECT 'rarity' AS Type, RarityId AS Id, Name FROM pf2.Rarity
      UNION ALL SELECT 'size', SizeId, Name FROM pf2.SizeCategory
      UNION ALL SELECT 'alignment', AlignmentId, Name FROM pf2.Alignment
      UNION ALL SELECT 'family', FamilyId, Name FROM pf2.MonsterFamily
      UNION ALL SELECT 'sourceBook', SourceBookId, Name FROM pf2.SourceBook
      ORDER BY Type, Name;
    `;

    logValue('SQL:', lookupSql);

    const result = await pool.request().query(lookupSql);

    const lookups = {
      rarity: [],
      size: [],
      alignment: [],
      family: [],
      sourceBook: []
    };

    for (const row of result.recordset) {
      lookups[row.Type].push({
        id: row.Id,
        name: row.Name
      });
    }

    logValue('Lookup row count:', result.recordset.length);
    logValue('Elapsed ms:', Date.now() - started);

    res.json(lookups);
  } catch (err) {
    logError(err);
    res.status(500).json({
      error: err.message
    });
  }
});

app.get('/api/spell-lookups', async (_req, res) => {
  const started = Date.now();

  try {
    logSection('GET /api/spell-lookups');

    const pool = await getPool();

    const lookupSql = `
      SELECT 'rarity' AS Type, RarityId AS Id, Name FROM pf2.Rarity
      UNION ALL SELECT 'sourceBook', SourceBookId, Name FROM pf2.SourceBook
      UNION ALL SELECT 'tradition', TraditionId, Name FROM pf2.Tradition
      UNION ALL SELECT 'trait', TraitId, Name FROM pf2.Trait
      ORDER BY Type, Name;
    `;

    logValue('SQL:', lookupSql);

    const result = await pool.request().query(lookupSql);

    const lookups = {
      rarity: [],
      sourceBook: [],
      tradition: [],
      trait: []
    };

    for (const row of result.recordset) {
      lookups[row.Type].push({
        id: row.Id,
        name: row.Name
      });
    }

    logValue('Lookup row count:', result.recordset.length);
    logValue('Elapsed ms:', Date.now() - started);

    res.json(lookups);
  } catch (err) {
    logError(err);
    res.status(500).json({
      error: err.message
    });
  }
});

app.get('/api/feat-lookups', async (_req, res) => {
  const started = Date.now();

  try {
    logSection('GET /api/feat-lookups');

    const pool = await getPool();

    const lookupSql = `
      SELECT 'rarity' AS Type, RarityId AS Id, Name FROM pf2.Rarity
      UNION ALL SELECT 'sourceBook', SourceBookId, Name FROM pf2.SourceBook
      UNION ALL SELECT 'trait', TraitId, Name FROM pf2.Trait
      ORDER BY Type, Name;
    `;

    logValue('SQL:', lookupSql);

    const result = await pool.request().query(lookupSql);

    const lookups = {
      rarity: [],
      sourceBook: [],
      trait: []
    };

    for (const row of result.recordset) {
      lookups[row.Type].push({
        id: row.Id,
        name: row.Name
      });
    }

    logValue('Lookup row count:', result.recordset.length);
    logValue('Elapsed ms:', Date.now() - started);

    res.json(lookups);
  } catch (err) {
    logError(err);
    res.status(500).json({
      error: err.message
    });
  }
});

app.get('/api/equipment-lookups', async (_req, res) => {
  const started = Date.now();

  try {
    logSection('GET /api/equipment-lookups');

    const pool = await getPool();

    const lookupSql = `
      SELECT 'rarity' AS Type, RarityId AS Id, Name FROM pf2.Rarity
      UNION ALL SELECT 'sourceBook', SourceBookId, Name FROM pf2.SourceBook
      UNION ALL SELECT 'trait', TraitId, Name FROM pf2.Trait
      ORDER BY Type, Name;
    `;

    logValue('SQL:', lookupSql);

    const result = await pool.request().query(lookupSql);

    const lookups = {
      rarity: [],
      sourceBook: [],
      trait: []
    };

    for (const row of result.recordset) {
      lookups[row.Type].push({
        id: row.Id,
        name: row.Name
      });
    }

    logValue('Lookup row count:', result.recordset.length);
    logValue('Elapsed ms:', Date.now() - started);

    res.json(lookups);
  } catch (err) {
    logError(err);
    res.status(500).json({
      error: err.message
    });
  }
});

app.get('/api/equipment', async (req, res) => {
  const started = Date.now();

  try {
    logSection('GET /api/equipment');
    logValue('Raw query params:', req.query);

    const pool = await getPool();
    const request = pool.request();

    const where = [];
    const debugParams = {};

    addStringFilter(request, where, debugParams, 'e.Name', 'name', req.query.name);
    addIntFilter(request, where, debugParams, 'e.Level', 'levelMin', req.query.levelMin, '>=');
    addIntFilter(request, where, debugParams, 'e.Level', 'levelMax', req.query.levelMax, '<=');
    addStringFilter(request, where, debugParams, 'e.EquipmentType', 'equipmentType', req.query.equipmentType);
    addStringFilter(request, where, debugParams, 'e.SearchCategory', 'searchCategory', req.query.searchCategory);
    addStringFilter(request, where, debugParams, 'e.ItemCategory', 'itemCategory', req.query.itemCategory);
    addStringFilter(request, where, debugParams, 'e.ItemSubcategory', 'itemSubcategory', req.query.itemSubcategory);
    addStringFilter(request, where, debugParams, 'r.Name', 'rarity', req.query.rarity, true);
    addStringFilter(request, where, debugParams, 'sb.Name', 'sourceBook', req.query.sourceBook);
    addStringFilter(request, where, debugParams, 'e.PFS', 'pfs', req.query.pfs);
    addStringFilter(request, where, debugParams, 'e.PriceText', 'price', req.query.price);
    addStringFilter(request, where, debugParams, 'e.BulkText', 'bulk', req.query.bulk);
    addStringFilter(request, where, debugParams, 'e.WeaponCategory', 'weaponCategory', req.query.weaponCategory);
    addStringFilter(request, where, debugParams, 'e.WeaponGroup', 'weaponGroup', req.query.weaponGroup);
    addStringFilter(request, where, debugParams, 'e.WeaponType', 'weaponType', req.query.weaponType);
    addStringFilter(request, where, debugParams, 'e.DamageType', 'damageType', req.query.damageType);
    addStringFilter(request, where, debugParams, 'e.ArmorCategory', 'armorCategory', req.query.armorCategory);
    addIntFilter(request, where, debugParams, 'e.PriceCp', 'priceMin', req.query.priceMin, '>=');
    addIntFilter(request, where, debugParams, 'e.PriceCp', 'priceMax', req.query.priceMax, '<=');

    if (req.query.trait && String(req.query.trait).trim() !== '') {
      const clean = String(req.query.trait).trim();
      request.input('trait', sql.NVarChar, clean);
      where.push(`
        EXISTS (
          SELECT 1
          FROM pf2.EquipmentTrait etFilter
          INNER JOIN pf2.Trait tFilter
            ON tFilter.TraitId = etFilter.TraitId
          WHERE etFilter.EquipmentId = e.EquipmentId
            AND tFilter.Name = @trait
        )
      `);
      debugParams.trait = {
        type: 'NVarChar',
        value: clean,
        table: 'pf2.EquipmentTrait',
        exact: true
      };
    }

    if (req.query.text && String(req.query.text).trim() !== '') {
      const clean = String(req.query.text).trim();
      const sqlValue = `%${clean}%`;

      request.input('text', sql.NVarChar(4000), sqlValue);
      where.push(`
        (
          e.Name LIKE @text
          OR e.Summary LIKE @text
          OR e.RawText LIKE @text
          OR e.BaseItemText LIKE @text
          OR e.SpellText LIKE @text
          OR e.StageText LIKE @text
        )
      `);
      debugParams.text = {
        type: 'NVarChar',
        value: sqlValue,
        original: clean,
        columns: 'Name, Summary, RawText, BaseItemText, SpellText, StageText'
      };
    }

    const rawLimit = Number(req.query.limit || 100);
    const rawOffset = Number(req.query.offset || 0);

    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1), 500);
    const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

    const sortBy = normalizeEquipmentSortBy(req.query.sortBy);
    const sortDir = normalizeSortDir(req.query.sortDir);
    const orderBySql = buildEquipmentOrderBy(sortBy, sortDir);

    request.input('limit', sql.Int, limit);
    request.input('offset', sql.Int, offset);

    debugParams.limit = {
      type: 'Int',
      value: limit
    };

    debugParams.offset = {
      type: 'Int',
      value: offset
    };

    const fromSql = `
      FROM pf2.Equipment e
      LEFT JOIN pf2.Rarity r
        ON r.RarityId = e.RarityId
      LEFT JOIN pf2.SourceBook sb
        ON sb.SourceBookId = e.SourceBookId
      OUTER APPLY (
        SELECT STRING_AGG(t.Name, ', ') AS Traits
        FROM pf2.EquipmentTrait et
        INNER JOIN pf2.Trait t
          ON t.TraitId = et.TraitId
        WHERE et.EquipmentId = e.EquipmentId
      ) traits
    `;

    const countFromSql = `
      FROM pf2.Equipment e
      LEFT JOIN pf2.Rarity r
        ON r.RarityId = e.RarityId
      LEFT JOIN pf2.SourceBook sb
        ON sb.SourceBookId = e.SourceBookId
    `;

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const query = `
      SELECT
        e.EquipmentId,
        e.AonId,
        e.AonKey,
        e.AonUrl,
        e.Name,
        e.Level,
        e.EquipmentType,
        e.SearchCategory,
        e.ItemCategory,
        e.ItemSubcategory,
        r.Name AS Rarity,
        sb.Name AS SourceBook,
        e.SourcePage,
        traits.Traits,
        e.PFS,
        e.PriceCp,
        e.PriceText,
        e.BulkValue,
        e.BulkText,
        e.Summary,
        e.RemasterId,
        e.BaseItemText,
        e.SpellText,
        e.StageText,
        e.WeaponCategory,
        e.WeaponGroup,
        e.WeaponType,
        e.Damage,
        e.DamageDie,
        e.DamageType,
        e.Hands,
        e.AmmunitionText,
        e.ArmorCategory,
        e.ArmorGroupText,
        e.AC,
        e.Hardness,
        e.HardnessText,
        e.HP,
        e.HPText,
        e.RawHtml,
        e.RawText,
        e.RawJson
      ${fromSql}
      ${whereSql}
      ORDER BY ${orderBySql}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

      SELECT COUNT(*) AS Total
      ${countFromSql}
      ${whereSql};
    `;

    logValue('WHERE:', where);
    logValue('Params:', debugParams);
    logValue('Sort:', { sortBy, sortDir, orderBySql });
    logValue('SQL:', query);

    const result = await request.query(query);

    console.log('\nFINAL SQL');
    console.log(query);

    console.log('\nBOUND PARAMETERS');
    console.dir(debugParams, { depth: null });

    const rows = result.recordsets?.[0] || [];
    const total = result.recordsets?.[1]?.[0]?.Total || 0;

    logValue('Rows returned:', rows.length);
    logValue('Total:', total);
    logValue('Elapsed ms:', Date.now() - started);

    res.json({
      rows,
      total,
      limit,
      offset,
      debug: DEBUG_SQL
        ? {
            where,
            params: debugParams,
            sortBy,
            sortDir,
            orderBySql,
            elapsedMs: Date.now() - started
          }
        : undefined
    });
  } catch (err) {
    logError(err);

    res.status(500).json({
      error: err.message,
      debug: DEBUG_SQL
        ? {
            query: req.query
          }
        : undefined
    });
  }
});

app.get('/api/feats', async (req, res) => {
  const started = Date.now();

  try {
    logSection('GET /api/feats');
    logValue('Raw query params:', req.query);

    const pool = await getPool();
    const request = pool.request();

    const where = [];
    const debugParams = {};

    addStringFilter(request, where, debugParams, 'f.Name', 'name', req.query.name);
    addIntFilter(request, where, debugParams, 'f.Level', 'levelMin', req.query.levelMin, '>=');
    addIntFilter(request, where, debugParams, 'f.Level', 'levelMax', req.query.levelMax, '<=');
    addStringFilter(request, where, debugParams, 'f.FeatType', 'featType', req.query.featType);
    addStringFilter(request, where, debugParams, 'r.Name', 'rarity', req.query.rarity, true);
    addStringFilter(request, where, debugParams, 'sb.Name', 'sourceBook', req.query.sourceBook);
    addStringFilter(request, where, debugParams, 'f.PFS', 'pfs', req.query.pfs);
    addBoolFilter(request, where, debugParams, 'f.IsStandardAncestryFeat', 'isStandardAncestryFeat', req.query.isStandardAncestryFeat);

    if (req.query.trait && String(req.query.trait).trim() !== '') {
      const clean = String(req.query.trait).trim();
      request.input('trait', sql.NVarChar, clean);
      where.push(`
        EXISTS (
          SELECT 1
          FROM pf2.FeatTrait ftFilter
          INNER JOIN pf2.Trait tFilter
            ON tFilter.TraitId = ftFilter.TraitId
          WHERE ftFilter.FeatId = f.FeatId
            AND tFilter.Name = @trait
        )
      `);
      debugParams.trait = {
        type: 'NVarChar',
        value: clean,
        table: 'pf2.FeatTrait',
        exact: true
      };
    }

    if (req.query.text && String(req.query.text).trim() !== '') {
      const clean = String(req.query.text).trim();
      const sqlValue = `%${clean}%`;

      request.input('text', sql.NVarChar(4000), sqlValue);
      where.push(`
        (
          f.Name LIKE @text
          OR f.Summary LIKE @text
          OR f.RawText LIKE @text
        )
      `);
      debugParams.text = {
        type: 'NVarChar',
        value: sqlValue,
        original: clean,
        columns: 'Name, Summary, RawText'
      };
    }

    const rawLimit = Number(req.query.limit || 100);
    const rawOffset = Number(req.query.offset || 0);

    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1), 500);
    const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

    const sortBy = normalizeFeatSortBy(req.query.sortBy);
    const sortDir = normalizeSortDir(req.query.sortDir);
    const orderBySql = buildFeatOrderBy(sortBy, sortDir);

    request.input('limit', sql.Int, limit);
    request.input('offset', sql.Int, offset);

    debugParams.limit = {
      type: 'Int',
      value: limit
    };

    debugParams.offset = {
      type: 'Int',
      value: offset
    };

    const fromSql = `
      FROM pf2.Feat f
      LEFT JOIN pf2.Rarity r
        ON r.RarityId = f.RarityId
      LEFT JOIN pf2.SourceBook sb
        ON sb.SourceBookId = f.SourceBookId
      OUTER APPLY (
        SELECT STRING_AGG(t.Name, ', ') AS Traits
        FROM pf2.FeatTrait ft
        INNER JOIN pf2.Trait t
          ON t.TraitId = ft.TraitId
        WHERE ft.FeatId = f.FeatId
      ) traits
    `;

    const countFromSql = `
      FROM pf2.Feat f
      LEFT JOIN pf2.Rarity r
        ON r.RarityId = f.RarityId
      LEFT JOIN pf2.SourceBook sb
        ON sb.SourceBookId = f.SourceBookId
    `;

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const query = `
      SELECT
        f.FeatId,
        f.AonId,
        f.AonUrl,
        f.Name,
        f.Level,
        f.FeatType,
        r.Name AS Rarity,
        sb.Name AS SourceBook,
        f.SourcePage,
        traits.Traits,
        f.PFS,
        f.IsStandardAncestryFeat,
        f.Summary,
        f.RemasterId,
        f.RawHtml,
        f.RawText,
        f.RawJson
      ${fromSql}
      ${whereSql}
      ORDER BY ${orderBySql}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

      SELECT COUNT(*) AS Total
      ${countFromSql}
      ${whereSql};
    `;

    logValue('WHERE:', where);
    logValue('Params:', debugParams);
    logValue('Sort:', { sortBy, sortDir, orderBySql });
    logValue('SQL:', query);

    const result = await request.query(query);

    console.log('\nFINAL SQL');
    console.log(query);

    console.log('\nBOUND PARAMETERS');
    console.dir(debugParams, { depth: null });

    const rows = result.recordsets?.[0] || [];
    const total = result.recordsets?.[1]?.[0]?.Total || 0;

    logValue('Rows returned:', rows.length);
    logValue('Total:', total);
    logValue('Elapsed ms:', Date.now() - started);

    res.json({
      rows,
      total,
      limit,
      offset,
      debug: DEBUG_SQL
        ? {
            where,
            params: debugParams,
            sortBy,
            sortDir,
            orderBySql,
            elapsedMs: Date.now() - started
          }
        : undefined
    });
  } catch (err) {
    logError(err);

    res.status(500).json({
      error: err.message,
      debug: DEBUG_SQL
        ? {
            query: req.query
          }
        : undefined
    });
  }
});

app.get('/api/spells', async (req, res) => {
  const started = Date.now();

  try {
    logSection('GET /api/spells');
    logValue('Raw query params:', req.query);

    const pool = await getPool();
    const request = pool.request();

    const where = [];
    const debugParams = {};

    addStringFilter(request, where, debugParams, 's.Name', 'name', req.query.name);
    addIntFilter(request, where, debugParams, 's.Rank', 'rankMin', req.query.rankMin, '>=');
    addIntFilter(request, where, debugParams, 's.Rank', 'rankMax', req.query.rankMax, '<=');
    addStringFilter(request, where, debugParams, 's.SpellType', 'spellType', req.query.spellType);
    addStringFilter(request, where, debugParams, 'r.Name', 'rarity', req.query.rarity, true);
    addStringFilter(request, where, debugParams, 'sb.Name', 'sourceBook', req.query.sourceBook);
    addStringFilter(request, where, debugParams, 's.Actions', 'actions', req.query.actions);
    addStringFilter(request, where, debugParams, 's.Defense', 'defense', req.query.defense);
    addStringFilter(request, where, debugParams, 's.Duration', 'duration', req.query.duration);

    if (req.query.tradition && String(req.query.tradition).trim() !== '') {
      const clean = String(req.query.tradition).trim();
      request.input('tradition', sql.NVarChar, clean);
      where.push(`
        EXISTS (
          SELECT 1
          FROM pf2.SpellTradition stFilter
          INNER JOIN pf2.Tradition trFilter
            ON trFilter.TraditionId = stFilter.TraditionId
          WHERE stFilter.SpellId = s.SpellId
            AND trFilter.Name = @tradition
        )
      `);
      debugParams.tradition = {
        type: 'NVarChar',
        value: clean,
        table: 'pf2.SpellTradition',
        exact: true
      };
    }

    if (req.query.trait && String(req.query.trait).trim() !== '') {
      const clean = String(req.query.trait).trim();
      request.input('trait', sql.NVarChar, clean);
      where.push(`
        EXISTS (
          SELECT 1
          FROM pf2.SpellTrait stFilter
          INNER JOIN pf2.Trait tFilter
            ON tFilter.TraitId = stFilter.TraitId
          WHERE stFilter.SpellId = s.SpellId
            AND tFilter.Name = @trait
        )
      `);
      debugParams.trait = {
        type: 'NVarChar',
        value: clean,
        table: 'pf2.SpellTrait',
        exact: true
      };
    }

    if (req.query.text && String(req.query.text).trim() !== '') {
      const clean = String(req.query.text).trim();
      const sqlValue = `%${clean}%`;

      request.input('text', sql.NVarChar(4000), sqlValue);
      where.push(`
        (
          s.Name LIKE @text
          OR s.Summary LIKE @text
          OR s.RawText LIKE @text
        )
      `);
      debugParams.text = {
        type: 'NVarChar',
        value: sqlValue,
        original: clean,
        columns: 'Name, Summary, RawText'
      };
    }

    const rawLimit = Number(req.query.limit || 100);
    const rawOffset = Number(req.query.offset || 0);

    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1), 500);
    const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

    const sortBy = normalizeSpellSortBy(req.query.sortBy);
    const sortDir = normalizeSortDir(req.query.sortDir);
    const orderBySql = buildSpellOrderBy(sortBy, sortDir);

    request.input('limit', sql.Int, limit);
    request.input('offset', sql.Int, offset);

    debugParams.limit = {
      type: 'Int',
      value: limit
    };

    debugParams.offset = {
      type: 'Int',
      value: offset
    };

    const fromSql = `
      FROM pf2.Spell s
      LEFT JOIN pf2.Rarity r
        ON r.RarityId = s.RarityId
      LEFT JOIN pf2.SourceBook sb
        ON sb.SourceBookId = s.SourceBookId
      OUTER APPLY (
        SELECT STRING_AGG(tr.Name, ', ') AS Traditions
        FROM pf2.SpellTradition st
        INNER JOIN pf2.Tradition tr
          ON tr.TraditionId = st.TraditionId
        WHERE st.SpellId = s.SpellId
      ) traditions
      OUTER APPLY (
        SELECT STRING_AGG(t.Name, ', ') AS Traits
        FROM pf2.SpellTrait st
        INNER JOIN pf2.Trait t
          ON t.TraitId = st.TraitId
        WHERE st.SpellId = s.SpellId
      ) traits
    `;

    const countFromSql = `
      FROM pf2.Spell s
      LEFT JOIN pf2.Rarity r
        ON r.RarityId = s.RarityId
      LEFT JOIN pf2.SourceBook sb
        ON sb.SourceBookId = s.SourceBookId
    `;

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const query = `
      SELECT
        s.SpellId,
        s.AonId,
        s.AonUrl,
        s.Name,
        s.Rank,
        s.SpellType,
        r.Name AS Rarity,
        sb.Name AS SourceBook,
        s.SourcePage,
        traditions.Traditions,
        traits.Traits,
        s.Actions,
        s.TriggerText,
        s.Target,
        s.RangeText,
        s.Area,
        s.Duration,
        s.Defense,
        s.Heighten,
        s.Summary,
        s.PFS,
        s.Components,
        s.School,
        s.Bloodline,
        s.DomainText,
        s.RemasterId,
        s.RemasterName,
        s.RawHtml,
        s.RawText,
        s.RawJson
      ${fromSql}
      ${whereSql}
      ORDER BY ${orderBySql}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

      SELECT COUNT(*) AS Total
      ${countFromSql}
      ${whereSql};
    `;

    logValue('WHERE:', where);
    logValue('Params:', debugParams);
    logValue('Sort:', { sortBy, sortDir, orderBySql });
    logValue('SQL:', query);

    const result = await request.query(query);

    console.log('\nFINAL SQL');
    console.log(query);

    console.log('\nBOUND PARAMETERS');
    console.dir(debugParams, { depth: null });

    const rows = result.recordsets?.[0] || [];
    const total = result.recordsets?.[1]?.[0]?.Total || 0;

    logValue('Rows returned:', rows.length);
    logValue('Total:', total);
    logValue('Elapsed ms:', Date.now() - started);

    res.json({
      rows,
      total,
      limit,
      offset,
      debug: DEBUG_SQL
        ? {
            where,
            params: debugParams,
            sortBy,
            sortDir,
            orderBySql,
            elapsedMs: Date.now() - started
          }
        : undefined
    });
  } catch (err) {
    logError(err);

    res.status(500).json({
      error: err.message,
      debug: DEBUG_SQL
        ? {
            query: req.query
          }
        : undefined
    });
  }
});

app.get('/api/monsters', async (req, res) => {
  const started = Date.now();

  try {
    logSection('GET /api/monsters');
    logValue('Raw query params:', req.query);

    const pool = await getPool();
    const request = pool.request();

    const where = [];
    const debugParams = {};

    addStringFilter(request, where, debugParams, 'Name', 'name', req.query.name);
    addIntFilter(request, where, debugParams, 'Level', 'levelMin', req.query.levelMin, '>=');
    addIntFilter(request, where, debugParams, 'Level', 'levelMax', req.query.levelMax, '<=');

    addStringFilter(request, where, debugParams, 'Rarity', 'rarity', req.query.rarity, true);
    addStringFilter(request, where, debugParams, 'Size', 'size', req.query.size, true);
    addStringFilter(request, where, debugParams, 'Alignment', 'alignment', req.query.alignment, true);

    addStringFilter(request, where, debugParams, 'Family', 'family', req.query.family);
    addStringFilter(request, where, debugParams, 'SourceBook', 'sourceBook', req.query.sourceBook);

    // old slow LIKE search - remove this
    // addStringFilter(request, where, debugParams, 'RawText', 'text', req.query.text);

    // new fast full-text search
    if (req.query.text && String(req.query.text).trim() !== '') {
      const clean = String(req.query.text).trim();
      const ft = `"${clean}*"`;

      request.input('text', sql.NVarChar(4000), ft);

      where.push(`
        MonsterId IN (
          SELECT MonsterId
          FROM pf2.Monster
          WHERE CONTAINS((Name, RawText), @text)
        )
      `);

      debugParams.text = {
        type: 'FullText',
        value: ft,
        table: 'pf2.Monster',
        columns: 'Name, RawText'
      };
    }
    addStringFilter(request, where, debugParams, 'Languages', 'languages', req.query.languages);
    addStringFilter(request, where, debugParams, 'Skills', 'skills', req.query.skills);
    addStringFilter(request, where, debugParams, 'Senses', 'senses', req.query.senses);
    addStringFilter(request, where, debugParams, 'Speed', 'speed', req.query.speed);

    addBoolFilter(request, where, debugParams, 'IsNPC', 'isNPC', req.query.isNPC);
    addBoolFilter(request, where, debugParams, 'IsUnique', 'isUnique', req.query.isUnique);

    addIntFilter(request, where, debugParams, 'HP', 'hpMin', req.query.hpMin, '>=');
    addIntFilter(request, where, debugParams, 'HP', 'hpMax', req.query.hpMax, '<=');
    addIntFilter(request, where, debugParams, 'AC', 'acMin', req.query.acMin, '>=');
    addIntFilter(request, where, debugParams, 'AC', 'acMax', req.query.acMax, '<=');

    const rawLimit = Number(req.query.limit || 100);
    const rawOffset = Number(req.query.offset || 0);

    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1), 500);
    const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

    const sortBy = normalizeSortBy(req.query.sortBy);
    const sortDir = normalizeSortDir(req.query.sortDir);
    const orderBySql = buildOrderBy(sortBy, sortDir);

    request.input('limit', sql.Int, limit);
    request.input('offset', sql.Int, offset);

    debugParams.limit = {
      type: 'Int',
      value: limit
    };

    debugParams.offset = {
      type: 'Int',
      value: offset
    };

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const query = `
      SELECT *
      FROM pf2.vwMonsterFull
      ${whereSql}
      ORDER BY ${orderBySql}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

      SELECT COUNT(*) AS Total
      FROM pf2.vwMonsterFull
      ${whereSql};
    `;

    logValue('WHERE:', where);
    logValue('Params:', debugParams);
    logValue('Sort:', { sortBy, sortDir, orderBySql });
    logValue('SQL:', query);

    const result = await request.query(query);

    console.log('\nFINAL SQL');
    console.log(query);

    console.log('\nBOUND PARAMETERS');
    console.dir(debugParams, { depth: null });

    const rows = result.recordsets?.[0] || [];
    const total = result.recordsets?.[1]?.[0]?.Total || 0;

    logValue('Rows returned:', rows.length);
    logValue('Total:', total);
    logValue('Elapsed ms:', Date.now() - started);

    res.json({
      rows,
      total,
      limit,
      offset,
      debug: DEBUG_SQL
        ? {
            where,
            params: debugParams,
            sortBy,
            sortDir,
            orderBySql,
            elapsedMs: Date.now() - started
          }
        : undefined
    });
  } catch (err) {
    logError(err);

    res.status(500).json({
      error: err.message,
      debug: DEBUG_SQL
        ? {
            query: req.query
          }
        : undefined
    });
  }
});

app.listen(port, () => {
  console.log(`PF2 monster search API listening on http://localhost:${port}`);
  console.log(`DEBUG_SQL=${DEBUG_SQL}`);
});
