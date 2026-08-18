import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, sql } from './db.js';
import {
  attachMonsterImageUrls,
  createMonsterImageCache,
  fetchMonsterImageFromDb,
  getCachedMonsterThumbnail,
  sendMonsterImageResponse
} from './monsterImages.js';
import { freePort, isPortListening, sleep } from './freePort.mjs';

dotenv.config({
  path: join(dirname(fileURLToPath(import.meta.url)), '../.env')
});

const app = express();
const port = Number(process.env.PORT || 3333);
const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
const clientDistDir = join(rootDir, 'client', 'dist');

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const DEBUG_SQL =
  String(process.env.DEBUG_SQL || 'true').toLowerCase() === 'true';

const ENABLE_ART =
  String(process.env.ENABLE_ART || 'true').toLowerCase() === 'true';
const ENABLE_ART_PWD = String(process.env.ENABLE_ART_PWD || '');
const ART_COOKIE = 'pf2_art';
const artUnlockTokens = new Set();

function passwordsMatch(provided, expected) {
  const a = Buffer.from(String(provided ?? ''), 'utf8');
  const b = Buffer.from(String(expected ?? ''), 'utf8');
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function parseCookies(req) {
  const header = String(req.headers.cookie || '');
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

function isArtEnabled(req) {
  if (ENABLE_ART) return true;
  const token = parseCookies(req)[ART_COOKIE];
  return Boolean(token && artUnlockTokens.has(token));
}

function rejectArtIfLocked(req, res) {
  if (isArtEnabled(req)) return false;
  res.setHeader('Cache-Control', 'no-store');
  res.status(404).json({ error: 'Art is disabled' });
  return true;
}

const monsterImageCache = createMonsterImageCache();
let creatureViewNamePromise;

async function getCreatureViewName(pool) {
  if (!creatureViewNamePromise) {
    creatureViewNamePromise = pool.request()
      .query(`
        SELECT OBJECT_ID(N'pf2.vwMonsterList', N'V') AS ListViewId
      `)
      .then((result) => (
        result.recordset?.[0]?.ListViewId ? 'pf2.vwMonsterList' : 'pf2.vwMonsterFull'
      ))
      .catch(() => 'pf2.vwMonsterFull');
  }

  return creatureViewNamePromise;
}

const allowedSortColumns = new Set([
  'Name',
  'Level',
  'Rarity',
  'Size',
  'Alignment',
  'Family',
  'GameSystem',
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
  console.error('Message:', getErrorMessage(err));
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

function getErrorMessage(err) {
  if (!err) return 'Unknown error';

  const candidates = [
    err.message,
    err.originalError?.message,
    err.originalError?.info?.message,
    err.precedingErrors?.[0]?.message,
    err.info?.message,
    err.code
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate && candidate !== '[object Object]') {
      return candidate;
    }
  }

  if (typeof err.originalError === 'string' && err.originalError) {
    return err.originalError;
  }

  if (typeof err.message === 'object' && err.message) {
    try {
      return JSON.stringify(err.message);
    } catch {
      return 'Database error';
    }
  }

  if (
    !String(process.env.SQL_USER || '').trim() &&
    String(process.env.SQL_TRUSTED_CONNECTION || '').toLowerCase() !== 'true' &&
    process.platform !== 'win32'
  ) {
    return 'Database login failed. Set SQL_TRUSTED_CONNECTION=true or provide SQL_USER and SQL_PASSWORD in server/.env';
  }

  try {
    const serialized = JSON.stringify(err, Object.getOwnPropertyNames(err));
    if (serialized && serialized !== '{}' && serialized !== '[object Object]') {
      return serialized;
    }
  } catch {
    // fall through
  }

  return 'Database error';
}

let sourcePurchaseUrlByNamePromise;

async function getSourcePurchaseUrlMap(pool) {
  if (!sourcePurchaseUrlByNamePromise) {
    sourcePurchaseUrlByNamePromise = pool.request().query(`
      SELECT sb.Name, sbp.StoreUrl
      FROM pf2.SourceBook sb
      INNER JOIN pf2.SourceBookPurchase sbp
        ON sbp.SourceBookPurchaseId = sb.SourcePurchaseID
    `).then((result) => {
      const map = new Map();
      for (const row of result.recordset || []) {
        map.set(row.Name, row.StoreUrl);
      }
      return map;
    }).catch((err) => {
      sourcePurchaseUrlByNamePromise = null;
      throw err;
    });
  }

  return sourcePurchaseUrlByNamePromise;
}

function buildSourcePurchaseUrl(sourceBook, urlMap) {
  if (!sourceBook) return null;

  const names = String(sourceBook).split(',').map((part) => part.trim()).filter(Boolean);
  const urls = names.map((name) => urlMap.get(name) || '');

  if (urls.every((url) => !url)) return null;
  return urls.join(', ');
}

async function attachSourcePurchaseUrls(pool, rows) {
  if (!rows.length) return rows;

  const urlMap = await getSourcePurchaseUrlMap(pool);
  for (const row of rows) {
    row.SourcePurchaseURL = buildSourcePurchaseUrl(row.SourceBook, urlMap);
  }

  return rows;
}

function sourcesOuterApplySql(entityAlias, linkTable, entityIdColumn) {
  const linkSortColumn = {
    EquipmentSourceLink: 'EquipmentSourceLinkId',
    FeatSourceLink: 'FeatSourceLinkId',
    SpellSourceLink: 'SpellSourceLinkId'
  }[linkTable];

  return `
      OUTER APPLY (
        SELECT
          STRING_AGG(src.Name, ', ') WITHIN GROUP (ORDER BY src.SortOrder, src.Name) AS SourceBook,
          NULLIF(
            STRING_AGG(CAST(ISNULL(src.StoreUrl, '') AS NVARCHAR(MAX)), ', ') WITHIN GROUP (ORDER BY src.SortOrder, src.Name),
            ''
          ) AS SourcePurchaseURL
        FROM (
          SELECT sourceRows.Name, MAX(sourceRows.StoreUrl) AS StoreUrl, MIN(sourceRows.SortOrder) AS SortOrder
          FROM (
            SELECT sb.Name, sbp.StoreUrl, 0 AS SortOrder
            WHERE sb.Name IS NOT NULL
            UNION ALL
            SELECT lsb.Name, lsbp.StoreUrl, link.${linkSortColumn} AS SortOrder
            FROM pf2.${linkTable} link
            INNER JOIN pf2.SourceBook lsb
              ON lsb.SourceBookId = link.SourceBookId
            LEFT JOIN pf2.SourceBookPurchase lsbp
              ON lsbp.SourceBookPurchaseId = lsb.SourcePurchaseID
            WHERE link.${entityIdColumn} = ${entityAlias}.${entityIdColumn}
          ) sourceRows
          GROUP BY sourceRows.Name
        ) src
      ) sources`;
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
    SourceBook: 'sources.SourceBook',
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
    Rarity: 'f.Rarity',
    SourceBook: 'sources.SourceBook',
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
    SourceBook: 'sources.SourceBook',
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

function addNameStartsWithFilter(request, where, debugParams, column, value) {
  if (value === undefined || value === null || String(value).trim() === '') return;

  const letter = String(value).trim().slice(0, 1).toUpperCase();
  if (!/^[A-Z]$/.test(letter)) {
    debugParams.nameStartsWith = {
      skipped: true,
      reason: 'expected A-Z',
      value
    };
    return;
  }

  const sqlValue = `${letter}%`;
  request.input('nameStartsWith', sql.NVarChar(2), sqlValue);
  where.push(`${column} LIKE @nameStartsWith`);

  debugParams.nameStartsWith = {
    type: 'NVarChar',
    value: sqlValue,
    original: letter,
    column
  };
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

function addFullTextFilter(request, where, debugParams, {
  paramName,
  table,
  idColumn,
  columns,
  value,
  outerColumn
}) {
  if (value === undefined || value === null || String(value).trim() === '') return;

  const clean = String(value).trim();
  const ft = `"${clean.replace(/"/g, '""')}*"`;
  const columnList = columns.join(', ');

  request.input(paramName, sql.NVarChar(4000), ft);

  where.push(`
    ${outerColumn} IN (
      SELECT ${idColumn}
      FROM ${table}
      WHERE CONTAINS((${columnList}), @${paramName})
    )
  `);

  debugParams[paramName] = {
    type: 'FullText',
    value: ft,
    table,
    columns: columnList
  };
}

app.get('/api/config', (req, res) => {
  res.json({
    enableArt: ENABLE_ART,
    artUnlocked: isArtEnabled(req)
  });
});

app.post('/api/art/unlock', (req, res) => {
  if (ENABLE_ART) {
    res.json({ ok: true, enableArt: true, artUnlocked: true });
    return;
  }

  if (!passwordsMatch(req.body?.password, ENABLE_ART_PWD)) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }

  const token = randomBytes(32).toString('hex');
  artUnlockTokens.add(token);
  res.cookie(ART_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 12 * 60 * 60 * 1000
  });
  res.json({ ok: true, enableArt: false, artUnlocked: true });
});

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
      error: getErrorMessage(err)
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
      error: getErrorMessage(err)
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
      error: getErrorMessage(err)
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
      error: getErrorMessage(err)
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
      error: getErrorMessage(err)
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
    addNameStartsWithFilter(request, where, debugParams, 'e.Name', req.query.nameStartsWith);
    addIntFilter(request, where, debugParams, 'e.Level', 'levelMin', req.query.levelMin, '>=');
    addIntFilter(request, where, debugParams, 'e.Level', 'levelMax', req.query.levelMax, '<=');
    addStringFilter(request, where, debugParams, 'e.EquipmentType', 'equipmentType', req.query.equipmentType);
    addStringFilter(request, where, debugParams, 'e.SearchCategory', 'searchCategory', req.query.searchCategory);
    addStringFilter(request, where, debugParams, 'e.ItemCategory', 'itemCategory', req.query.itemCategory);
    addStringFilter(request, where, debugParams, 'e.ItemSubcategory', 'itemSubcategory', req.query.itemSubcategory);
    addStringFilter(request, where, debugParams, 'r.Name', 'rarity', req.query.rarity, true);
    addStringFilter(request, where, debugParams, 'sources.SourceBook', 'sourceBook', req.query.sourceBook);
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

    addFullTextFilter(request, where, debugParams, {
      paramName: 'text',
      table: 'pf2.Equipment',
      idColumn: 'EquipmentId',
      columns: ['Name', 'Summary', 'RawText', 'BaseItemText', 'SpellText', 'StageText'],
      value: req.query.text,
      outerColumn: 'e.EquipmentId'
    });

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
      LEFT JOIN pf2.SourceBookPurchase sbp
        ON sbp.SourceBookPurchaseId = sb.SourcePurchaseID
      OUTER APPLY (
        SELECT STRING_AGG(t.Name, ', ') AS Traits
        FROM pf2.EquipmentTrait et
        INNER JOIN pf2.Trait t
          ON t.TraitId = et.TraitId
        WHERE et.EquipmentId = e.EquipmentId
      ) traits
      ${sourcesOuterApplySql('e', 'EquipmentSourceLink', 'EquipmentId')}
    `;

    const countFromSql = `
      FROM pf2.Equipment e
      LEFT JOIN pf2.Rarity r
        ON r.RarityId = e.RarityId
      LEFT JOIN pf2.SourceBook sb
        ON sb.SourceBookId = e.SourceBookId
      LEFT JOIN pf2.SourceBookPurchase sbp
        ON sbp.SourceBookPurchaseId = sb.SourcePurchaseID
      ${sourcesOuterApplySql('e', 'EquipmentSourceLink', 'EquipmentId')}
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
        sources.SourceBook,
        sources.SourcePurchaseURL,
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
        e.RawMD,
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
      error: getErrorMessage(err),
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
    addNameStartsWithFilter(request, where, debugParams, 'f.Name', req.query.nameStartsWith);
    addIntFilter(request, where, debugParams, 'f.Level', 'levelMin', req.query.levelMin, '>=');
    addIntFilter(request, where, debugParams, 'f.Level', 'levelMax', req.query.levelMax, '<=');
    addStringFilter(request, where, debugParams, 'f.FeatType', 'featType', req.query.featType);
    addStringFilter(request, where, debugParams, 'f.Rarity', 'rarity', req.query.rarity, true);
    addStringFilter(request, where, debugParams, 'sources.SourceBook', 'sourceBook', req.query.sourceBook);
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

    addFullTextFilter(request, where, debugParams, {
      paramName: 'text',
      table: 'pf2.Feat',
      idColumn: 'FeatId',
      columns: ['Name', 'Summary', 'RawText'],
      value: req.query.text,
      outerColumn: 'f.FeatId'
    });

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

    const featDedupCteSql = `
      WITH feat_base AS (
        SELECT
          f.FeatId,
          f.AonId,
          f.AonUrl,
          f.Name,
          f.Level,
          f.FeatType,
          f.RarityId,
          r.Name AS Rarity,
          f.SourceBookId,
          sb.Name AS PrimarySourceBook,
          sbp.StoreUrl AS PrimarySourcePurchaseURL,
          f.SourcePage,
          traits.Traits,
          f.PFS,
          f.IsStandardAncestryFeat,
          f.Summary,
          f.RemasterId,
          f.RawHtml,
          f.RawText,
          f.RawMD,
          f.RawJson,
          MIN(f.FeatId) OVER (
            PARTITION BY
              f.Name,
              ISNULL(f.Level, -2147483648),
              ISNULL(f.FeatType, N''),
              ISNULL(f.RarityId, -2147483648),
              ISNULL(f.PFS, N''),
              ISNULL(CAST(f.IsStandardAncestryFeat AS int), -1)
          ) AS DuplicateGroupId,
          ROW_NUMBER() OVER (
            PARTITION BY
              f.Name,
              ISNULL(f.Level, -2147483648),
              ISNULL(f.FeatType, N''),
              ISNULL(f.RarityId, -2147483648),
              ISNULL(f.PFS, N''),
              ISNULL(CAST(f.IsStandardAncestryFeat AS int), -1)
            ORDER BY f.FeatId
          ) AS DuplicateRank
        FROM pf2.Feat f
        LEFT JOIN pf2.Rarity r
          ON r.RarityId = f.RarityId
        LEFT JOIN pf2.SourceBook sb
          ON sb.SourceBookId = f.SourceBookId
        LEFT JOIN pf2.SourceBookPurchase sbp
          ON sbp.SourceBookPurchaseId = sb.SourcePurchaseID
        OUTER APPLY (
          SELECT STRING_AGG(t.Name, ', ') AS Traits
          FROM pf2.FeatTrait ft
          INNER JOIN pf2.Trait t
            ON t.TraitId = ft.TraitId
          WHERE ft.FeatId = f.FeatId
        ) traits
      ),
      feat_dedup AS (
        SELECT *
        FROM feat_base
        WHERE DuplicateRank = 1
      )
    `;

    const featSourcesOuterApplySql = `
      OUTER APPLY (
        SELECT
          STRING_AGG(src.Name, ', ') WITHIN GROUP (ORDER BY src.SortOrder, src.Name) AS SourceBook,
          NULLIF(
            STRING_AGG(CAST(ISNULL(src.StoreUrl, '') AS NVARCHAR(MAX)), ', ') WITHIN GROUP (ORDER BY src.SortOrder, src.Name),
            ''
          ) AS SourcePurchaseURL
        FROM (
          SELECT sourceRows.Name, MAX(sourceRows.StoreUrl) AS StoreUrl, MIN(sourceRows.SortOrder) AS SortOrder
          FROM (
            SELECT
              x.PrimarySourceBook AS Name,
              x.PrimarySourcePurchaseURL AS StoreUrl,
              x.FeatId AS SortOrder
            FROM feat_base x
            WHERE x.DuplicateGroupId = f.DuplicateGroupId
              AND x.PrimarySourceBook IS NOT NULL
            UNION ALL
            SELECT
              lsb.Name,
              lsbp.StoreUrl,
              link.FeatSourceLinkId AS SortOrder
            FROM feat_base x
            INNER JOIN pf2.FeatSourceLink link
              ON link.FeatId = x.FeatId
            INNER JOIN pf2.SourceBook lsb
              ON lsb.SourceBookId = link.SourceBookId
            LEFT JOIN pf2.SourceBookPurchase lsbp
              ON lsbp.SourceBookPurchaseId = lsb.SourcePurchaseID
            WHERE x.DuplicateGroupId = f.DuplicateGroupId
          ) sourceRows
          WHERE sourceRows.Name IS NOT NULL
          GROUP BY sourceRows.Name
        ) src
      ) sources
    `;

    const fromSql = `
      FROM feat_dedup f
      OUTER APPLY (
        SELECT STRING_AGG(t.Name, ', ') AS Traits
        FROM pf2.FeatTrait ft
        INNER JOIN pf2.Trait t
          ON t.TraitId = ft.TraitId
        WHERE ft.FeatId = f.FeatId
      ) traits
      ${featSourcesOuterApplySql}
    `;

    const countFromSql = `
      FROM feat_dedup f
      ${featSourcesOuterApplySql}
    `;

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const query = `
      ${featDedupCteSql}
      SELECT
        f.FeatId,
        f.AonId,
        f.AonUrl,
        f.Name,
        f.Level,
        f.FeatType,
        f.Rarity,
        sources.SourceBook,
        sources.SourcePurchaseURL,
        f.SourcePage,
        traits.Traits,
        f.PFS,
        f.IsStandardAncestryFeat,
        f.Summary,
        f.RemasterId,
        f.RawHtml,
        f.RawText,
        f.RawMD,
        f.RawJson
      ${fromSql}
      ${whereSql}
      ORDER BY ${orderBySql}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

      ${featDedupCteSql}
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
      error: getErrorMessage(err),
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
    addNameStartsWithFilter(request, where, debugParams, 's.Name', req.query.nameStartsWith);
    addIntFilter(request, where, debugParams, 's.Rank', 'rankMin', req.query.rankMin, '>=');
    addIntFilter(request, where, debugParams, 's.Rank', 'rankMax', req.query.rankMax, '<=');
    addStringFilter(request, where, debugParams, 's.SpellType', 'spellType', req.query.spellType);
    addStringFilter(request, where, debugParams, 'r.Name', 'rarity', req.query.rarity, true);
    addStringFilter(request, where, debugParams, 'sources.SourceBook', 'sourceBook', req.query.sourceBook);
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

    addFullTextFilter(request, where, debugParams, {
      paramName: 'text',
      table: 'pf2.Spell',
      idColumn: 'SpellId',
      columns: ['Name', 'Summary', 'RawText'],
      value: req.query.text,
      outerColumn: 's.SpellId'
    });

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
      LEFT JOIN pf2.SourceBookPurchase sbp
        ON sbp.SourceBookPurchaseId = sb.SourcePurchaseID
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
      ${sourcesOuterApplySql('s', 'SpellSourceLink', 'SpellId')}
    `;

    const countFromSql = `
      FROM pf2.Spell s
      LEFT JOIN pf2.Rarity r
        ON r.RarityId = s.RarityId
      LEFT JOIN pf2.SourceBook sb
        ON sb.SourceBookId = s.SourceBookId
      LEFT JOIN pf2.SourceBookPurchase sbp
        ON sbp.SourceBookPurchaseId = sb.SourcePurchaseID
      ${sourcesOuterApplySql('s', 'SpellSourceLink', 'SpellId')}
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
        sources.SourceBook,
        sources.SourcePurchaseURL,
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
        s.RawMD,
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
      error: getErrorMessage(err),
      debug: DEBUG_SQL
        ? {
            query: req.query
          }
        : undefined
    });
  }
});

async function queryCreatures(req, res, { routeLabel, npcMode }) {
  const started = Date.now();

  try {
    logSection(routeLabel);
    logValue('Raw query params:', req.query);

    const pool = await getPool();
    const request = pool.request();

    const where = [];
    const debugParams = {};

    addStringFilter(request, where, debugParams, 'Name', 'name', req.query.name);
    addNameStartsWithFilter(request, where, debugParams, 'Name', req.query.nameStartsWith);
    addIntFilter(request, where, debugParams, 'Level', 'levelMin', req.query.levelMin, '>=');
    addIntFilter(request, where, debugParams, 'Level', 'levelMax', req.query.levelMax, '<=');

    addStringFilter(request, where, debugParams, 'Rarity', 'rarity', req.query.rarity, true);
    addStringFilter(request, where, debugParams, 'Size', 'size', req.query.size, true);
    addStringFilter(request, where, debugParams, 'Alignment', 'alignment', req.query.alignment, true);

    addStringFilter(request, where, debugParams, 'Family', 'family', req.query.family);
    addStringFilter(request, where, debugParams, 'SourceBook', 'sourceBook', req.query.sourceBook);

    if (req.query.gameSystem !== undefined && req.query.gameSystem !== null && String(req.query.gameSystem).trim() !== '') {
      const gameSystem = String(req.query.gameSystem).trim().toUpperCase();

      if (gameSystem === 'PF2' || gameSystem === 'SF2') {
        request.input('gameSystem', sql.NVarChar(3), gameSystem);
        where.push('GameSystem = @gameSystem');
        debugParams.gameSystem = {
          type: 'NVarChar',
          value: gameSystem,
          column: 'GameSystem',
          calculatedFrom: 'SourceBook'
        };
      } else {
        debugParams.gameSystem = {
          skipped: true,
          reason: 'expected PF2 or SF2',
          value: req.query.gameSystem
        };
      }
    }

    addFullTextFilter(request, where, debugParams, {
      paramName: 'text',
      table: 'pf2.Monster',
      idColumn: 'MonsterId',
      columns: ['Name', 'RawText'],
      value: req.query.text,
      outerColumn: 'MonsterId'
    });
    addStringFilter(request, where, debugParams, 'Languages', 'languages', req.query.languages);
    addStringFilter(request, where, debugParams, 'Skills', 'skills', req.query.skills);
    addStringFilter(request, where, debugParams, 'Senses', 'senses', req.query.senses);
    addStringFilter(request, where, debugParams, 'Speed', 'speed', req.query.speed);

    const npcBit = npcMode === 'only' ? 1 : 0;
    request.input('isNpcFilter', sql.Bit, npcBit);
    where.push('IsNPC = @isNpcFilter');
    debugParams.isNpcFilter = {
      type: 'Bit',
      value: npcBit,
      column: 'IsNPC',
      mode: npcMode
    };

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
    const creatureView = await getCreatureViewName(pool);
    const sourceSystemSql = `
      SELECT *,
        CASE
          WHEN SourceBook = N'Alien Core'
            OR SourceBook LIKE N'Alien Core,%'
            OR SourceBook LIKE N'%, Alien Core'
            OR SourceBook LIKE N'%, Alien Core,%'
            OR SourceBook LIKE N'%Starfinder%'
          THEN N'SF2'
          ELSE N'PF2'
        END AS GameSystem
      FROM ${creatureView}
    `;

    const query = `
      SELECT *
      FROM (
        ${sourceSystemSql}
      ) creatures
      ${whereSql}
      ORDER BY ${orderBySql}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

      SELECT COUNT(*) AS Total
      FROM (
        ${sourceSystemSql}
      ) creatures
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

    if (isArtEnabled(req)) {
      await attachMonsterImageUrls(pool, rows);
    }
    await attachSourcePurchaseUrls(pool, rows);

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
      error: getErrorMessage(err),
      debug: DEBUG_SQL
        ? {
            query: req.query
          }
        : undefined
    });
  }
}

app.get('/api/monsters', (req, res) => queryCreatures(req, res, {
  routeLabel: 'GET /api/monsters',
  npcMode: 'exclude'
}));

app.get('/api/npcs', (req, res) => queryCreatures(req, res, {
  routeLabel: 'GET /api/npcs',
  npcMode: 'only'
}));

app.get('/api/monsters/:monsterId/image/thumb', async (req, res) => {
  const started = Date.now();
  const monsterId = Number(req.params.monsterId);

  logSection('GET /api/monsters/:monsterId/image/thumb');
  logValue('monsterId:', req.params.monsterId);

  if (!Number.isInteger(monsterId) || monsterId <= 0) {
    res.status(400).json({ error: 'Invalid monsterId' });
    return;
  }

  if (rejectArtIfLocked(req, res)) return;

  try {
    const pool = await getPool();
    const image = await getCachedMonsterThumbnail(pool, monsterImageCache, monsterId);

    if (!image) {
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.status(404).json({ error: 'Monster image not found' });
      return;
    }

    sendMonsterImageResponse(res, image, { cacheControl: 'public, max-age=86400' });
    logValue('Bytes:', image.byteLength);
    logValue('Content-Type:', image.contentType);
    logValue('Cache hit:', image.cacheHit);
    logValue('Elapsed ms:', Date.now() - started);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

app.get('/api/monsters/:monsterId/image', async (req, res) => {
  const started = Date.now();
  const monsterId = Number(req.params.monsterId);

  logSection('GET /api/monsters/:monsterId/image');
  logValue('monsterId:', req.params.monsterId);

  if (!Number.isInteger(monsterId) || monsterId <= 0) {
    res.status(400).json({ error: 'Invalid monsterId' });
    return;
  }

  if (rejectArtIfLocked(req, res)) return;

  try {
    const pool = await getPool();
    const image = await fetchMonsterImageFromDb(pool, monsterId);

    if (!image) {
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.status(404).json({ error: 'Monster image not found' });
      return;
    }

    sendMonsterImageResponse(res, image, { cacheControl: 'no-store' });
    logValue('Bytes:', image.byteLength);
    logValue('Content-Type:', image.contentType);
    logValue('Elapsed ms:', Date.now() - started);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

const sourceSchemasDir = join(rootDir, 'schemas');
const builtSchemasDir = join(clientDistDir, 'schemas');
const schemaCandidates = process.env.npm_lifecycle_event === 'dev'
  ? [sourceSchemasDir, builtSchemasDir]
  : [builtSchemasDir, sourceSchemasDir];
const schemasDir = schemaCandidates.find(existsSync) ?? null;
if (schemasDir) {
  app.use('/schemas', express.static(schemasDir, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.yaml')) {
        res.setHeader('Content-Type', 'application/yaml; charset=utf-8');
      } else if (filePath.endsWith('.md')) {
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      }
    }
  }));
}

const imagesDir = [join(rootDir, 'images'), join(clientDistDir, 'images')].find(existsSync) ?? null;
if (imagesDir) {
  app.use('/images', express.static(imagesDir));
}

if (existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/schemas/') || req.path.startsWith('/images/')) {
      next();
      return;
    }

    res.sendFile(join(clientDistDir, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev && isPortListening(port)) {
    console.log(`Port ${port} is in use — stopping the previous dev server...`);
    freePort(port, { excludePids: [process.pid] });
    await sleep(750);
  }

  await new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`PF2 search listening on http://localhost:${port}`);
      if (existsSync(clientDistDir)) {
        console.log(`Serving client from ${clientDistDir}`);
      } else {
        console.log('Client dist not found — API only. Run "npm run build" to serve the UI from this process.');
      }
      if (schemasDir) {
        console.log(`Serving schemas from ${schemasDir}`);
      }
      if (imagesDir) {
        console.log(`Serving schema images from ${imagesDir}`);
      }
      console.log(`DEBUG_SQL=${DEBUG_SQL}`);
      console.log(`ENABLE_ART=${ENABLE_ART}`);
      console.log(
        ENABLE_ART
          ? 'Creature art: serving'
          : 'Creature art: locked (not serving until password)'
      );
      console.log(`MONSTER_IMAGE_CACHE_MAX=${monsterImageCache.maxEntries}`);
      resolve(server);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is still in use after cleanup.`);
        console.error('Stop the running dev session first: npm run dev:stop');
        console.error(`Or: Get-NetTCPConnection -LocalPort ${port} -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`);
        process.exit(1);
        return;
      }
      reject(err);
    });
  });
}

startServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
