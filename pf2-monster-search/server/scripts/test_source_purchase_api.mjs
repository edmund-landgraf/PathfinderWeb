import { getPool } from '../src/db.js';

const pool = await getPool();

const mapResult = await pool.request().query(`
  SELECT sb.Name, sbp.StoreUrl
  FROM pf2.SourceBook sb
  INNER JOIN pf2.SourceBookPurchase sbp
    ON sbp.SourceBookPurchaseId = sb.SourcePurchaseID
`);

const urlMap = new Map(mapResult.recordset.map((row) => [row.Name, row.StoreUrl]));

const monster = await pool.request().query(`
  SELECT TOP 1 Name, SourceBook
  FROM pf2.vwMonsterFull
  WHERE SourceBook IS NOT NULL
`);

const spell = await pool.request().query(`
  SELECT TOP 1 s.Name, sources.SourceBook, sources.SourcePurchaseURL
  FROM pf2.Spell s
  LEFT JOIN pf2.SourceBook sb ON sb.SourceBookId = s.SourceBookId
  LEFT JOIN pf2.SourceBookPurchase sbp ON sbp.SourceBookPurchaseId = sb.SourcePurchaseID
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
        SELECT lsb.Name, lsbp.StoreUrl, link.SpellSourceLinkId AS SortOrder
        FROM pf2.SpellSourceLink link
        INNER JOIN pf2.SourceBook lsb ON lsb.SourceBookId = link.SourceBookId
        LEFT JOIN pf2.SourceBookPurchase lsbp ON lsbp.SourceBookPurchaseId = lsb.SourcePurchaseID
        WHERE link.SpellId = s.SpellId
      ) sourceRows
      GROUP BY sourceRows.Name
    ) src
  ) sources
  WHERE sources.SourceBook IS NOT NULL
`);

console.log('Monster sample:', monster.recordset[0], 'URL:', urlMap.get(monster.recordset[0].SourceBook));
console.log('Spell sample:', spell.recordset[0]);

process.exit(0);
