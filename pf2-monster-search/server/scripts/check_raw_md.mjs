import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sql from 'mssql/msnodesqlv8.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');

const { unified } = await import(
  pathToFileURL(path.join(root, 'client', 'node_modules', 'unified', 'index.js')).href
);
const { default: remarkParse } = await import(
  pathToFileURL(path.join(root, 'client', 'node_modules', 'remark-parse', 'index.js')).href
);
const { default: remarkGfm } = await import(
  pathToFileURL(path.join(root, 'client', 'node_modules', 'remark-gfm', 'index.js')).href
);

const connectionString =
  'Driver={ODBC Driver 17 for SQL Server};' +
  'Server=localhost;' +
  'Database=PathfinderUtil;' +
  'Trusted_Connection=Yes;' +
  'TrustServerCertificate=Yes;';

const customTagPattern = /<\/?(?:title|row|column|traits?|actions|document|image)\b/i;
const processor = unified().use(remarkParse).use(remarkGfm);

const pool = await sql.connect({
  connectionString,
  driver: 'msnodesqlv8',
  options: {
    trustedConnection: true,
    trustServerCertificate: true,
  },
});

try {
  const result = await pool.request().query(`
    SELECT 'Monster' AS Entity, MonsterId AS EntityId, Name, RawMD
    FROM pf2.Monster
    WHERE RawMD IS NOT NULL
    UNION ALL
    SELECT 'Spell', SpellId, Name, RawMD
    FROM pf2.Spell
    WHERE RawMD IS NOT NULL
    UNION ALL
    SELECT 'Feat', FeatId, Name, RawMD
    FROM pf2.Feat
    WHERE RawMD IS NOT NULL
    UNION ALL
    SELECT 'Equipment', EquipmentId, Name, RawMD
    FROM pf2.Equipment
    WHERE RawMD IS NOT NULL
    ORDER BY Entity, EntityId;
  `);

  const failures = [];

  for (const row of result.recordset) {
    try {
      processor.parse(row.RawMD);

      if (customTagPattern.test(row.RawMD)) {
        failures.push({
          Entity: row.Entity,
          EntityId: row.EntityId,
          Name: row.Name,
          error: 'AoN custom tag remains in RawMD',
        });
      }
    } catch (err) {
      failures.push({
        Entity: row.Entity,
        EntityId: row.EntityId,
        Name: row.Name,
        error: err.message,
      });
    }

    if (failures.length >= 10) break;
  }

  const ok = failures.length === 0;

  console.log(JSON.stringify({
    markdownCheck: ok,
    rowsChecked: result.recordset.length,
    parser: 'remark-parse + remark-gfm',
    failures,
  }, null, 2));

  process.exitCode = ok ? 0 : 1;
} finally {
  await pool.close();
}
