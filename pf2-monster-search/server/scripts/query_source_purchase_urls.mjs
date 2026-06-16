import { getPool } from '../src/db.js';

try {
  const pool = await getPool();

  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'pf2' AND TABLE_NAME = 'SourceBook'
    ORDER BY ORDINAL_POSITION
  `);
  console.log('SourceBook columns:');
  console.table(cols.recordset);

  const rows = await pool.request().query(`
    SELECT SourceBookId, Name, SourcePurchaseURL
    FROM pf2.SourceBook
    ORDER BY Name
  `);
  console.log(`\nRows: ${rows.recordset.length}`);
  console.table(rows.recordset);

  console.log('\nJSON:');
  console.log(JSON.stringify(rows.recordset, null, 2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

process.exit(0);
