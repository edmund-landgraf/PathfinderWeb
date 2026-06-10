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

      request.input('text', sql.NVarChar, ft);

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
