import { getPool } from '../src/db.js';

const pool = await getPool();

const summary = await pool.request().query(`
  SELECT
    (SELECT COUNT(*) FROM pf2.Monster) AS monster_rows,
    (SELECT COUNT(DISTINCT Name) FROM pf2.Monster) AS distinct_names,
    (SELECT COUNT(*) FROM (
      SELECT Name FROM pf2.Monster GROUP BY Name HAVING COUNT(*) > 1
    ) d) AS names_with_duplicates,
    (SELECT SUM(cnt - 1) FROM (
      SELECT COUNT(*) AS cnt FROM pf2.Monster GROUP BY Name HAVING COUNT(*) > 1
    ) x) AS extra_rows_from_name_dupes
`);

console.log('\nName duplication:');
console.table(summary.recordset);

const topDupes = await pool.request().query(`
  SELECT TOP 10 Name, COUNT(*) AS cnt
  FROM pf2.Monster
  GROUP BY Name
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC, Name
`);

console.log('\nTop duplicate names:');
console.table(topDupes.recordset);

const aonDupes = await pool.request().query(`
  SELECT
    COUNT(*) AS total_rows,
    COUNT(DISTINCT AonId) AS distinct_aon_ids,
    COUNT(DISTINCT AonKey) AS distinct_aon_keys
  FROM pf2.Monster
  WHERE AonId IS NOT NULL
`);

console.log('\nAoN id uniqueness:');
console.table(aonDupes.recordset);

process.exit(0);
