import sql from 'mssql';
import { getPool } from '../src/db.js';

const pool = await getPool();
const request = pool.request();
request.input('isNpcFilter', sql.Bit, 1);
request.input('limit', sql.Int, 5);
request.input('offset', sql.Int, 0);

const result = await request.query(`
  SELECT TOP 5 *
  FROM pf2.vwMonsterFull
  WHERE IsNPC = @isNpcFilter
  ORDER BY Name ASC
`);

const rows = result.recordset;
console.log('row type', typeof rows[0], Object.isExtensible(rows[0]), Object.isFrozen(rows[0]));

try {
  rows[0].SourcePurchaseURL = 'test';
  console.log('assign ok', rows[0].SourcePurchaseURL);
} catch (err) {
  console.error('assign failed', err);
  console.error('message', err.message, typeof err.message);
}

process.exit(0);
