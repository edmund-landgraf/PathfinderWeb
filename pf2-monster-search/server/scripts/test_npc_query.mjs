import sql from 'mssql';
import { getPool } from '../src/db.js';

async function getSourcePurchaseUrlMap(pool) {
  const result = await pool.request().query(`
    SELECT sb.Name, sbp.StoreUrl
    FROM pf2.SourceBook sb
    INNER JOIN pf2.SourceBookPurchase sbp
      ON sbp.SourceBookPurchaseId = sb.SourcePurchaseID
  `);
  const map = new Map();
  for (const row of result.recordset || []) {
    map.set(row.Name, row.StoreUrl);
  }
  return map;
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

const pool = await getPool();
const request = pool.request();
const where = ['IsNPC = @isNpcFilter'];
request.input('isNpcFilter', sql.Bit, 1);
request.input('limit', sql.Int, 100);
request.input('offset', sql.Int, 0);

const query = `
  SELECT *
  FROM pf2.vwMonsterFull
  WHERE ${where.join(' AND ')}
  ORDER BY Name ASC, MonsterId ASC
  OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

  SELECT COUNT(*) AS Total
  FROM pf2.vwMonsterFull
  WHERE ${where.join(' AND ')};
`;

try {
  const result = await request.query(query);
  const rows = result.recordsets?.[0] || [];
  const total = result.recordsets?.[1]?.[0]?.Total || 0;
  await attachSourcePurchaseUrls(pool, rows);
  const payload = { rows, total, limit: 100, offset: 0 };
  JSON.stringify(payload);
  console.log('ok rows', rows.length, 'total', total, 'sample url', rows[0]?.SourcePurchaseURL);
} catch (err) {
  console.error('ERR name', err.name);
  console.error('ERR message', err.message, typeof err.message);
  console.error('ERR original', err.originalError?.message);
  console.error('ERR stack', err.stack?.split('\n').slice(0, 5).join('\n'));
}

process.exit(0);
