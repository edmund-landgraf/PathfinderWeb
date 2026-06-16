import { getPool } from '../src/db.js';

const pool = await getPool();
const cols = await pool.request().query(`
  SELECT TOP 1 SourceBook, SourcePage
  FROM pf2.vwMonsterFull
  WHERE SourceBook IS NOT NULL
`);
console.table(cols.recordset);

const map = await pool.request().query(`
  SELECT sb.Name, sbp.StoreUrl
  FROM pf2.SourceBook sb
  INNER JOIN pf2.SourceBookPurchase sbp
    ON sbp.SourceBookPurchaseId = sb.SourcePurchaseID
  WHERE sb.SourcePurchaseID IS NOT NULL
`);
console.log('mapped sources', map.recordset.length);
console.table(map.recordset.slice(0, 5));

process.exit(0);
