import fs from 'fs';

function sqlString(value) {
  return `N'${String(value).replace(/'/g, "''")}'`;
}

const buf = fs.readFileSync(new URL('./match_results.json', import.meta.url));
const raw = buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le') : buf.toString('utf8');
const matches = JSON.parse(raw.slice(raw.indexOf('[')));

const sourceLinks = matches
  .filter((row) => row.BestMatchURL && row.BestScore > 25)
  .map((row) => ({
    sourceBookId: row.SourceBookId,
    sourceBookName: row.Name,
    storeUrl: row.BestMatchURL.endsWith('/') ? row.BestMatchURL : `${row.BestMatchURL}/`
  }));

const valuesBlock = sourceLinks
  .map(
    (row, index) =>
      `        (${row.sourceBookId}, ${sqlString(row.storeUrl)})${index < sourceLinks.length - 1 ? ',' : ''} -- ${row.sourceBookName.replace(/'/g, "''")}`
  )
  .join('\n');

const updateSql = `-- Link pf2.SourceBook.SourcePurchaseID to pf2.SourceBookPurchase by store URL.
-- Generated ${new Date().toISOString()}
-- Mapped source books: ${sourceLinks.length}

USE PathfinderUtil;
GO

SET NOCOUNT ON;
GO

IF COL_LENGTH('pf2.SourceBook', 'SourcePurchaseID') IS NULL
BEGIN
    RAISERROR('Run create_source_book_purchase.sql first.', 16, 1);
    RETURN;
END
GO

UPDATE sb
SET sb.SourcePurchaseID = NULL
FROM pf2.SourceBook sb;
GO

UPDATE sb
SET sb.SourcePurchaseID = sbp.SourceBookPurchaseId
FROM pf2.SourceBook sb
INNER JOIN (
    VALUES
${valuesBlock}
) AS v(SourceBookId, StoreUrl)
  ON v.SourceBookId = sb.SourceBookId
INNER JOIN pf2.SourceBookPurchase sbp
  ON sbp.StoreUrl = v.StoreUrl;
GO

SELECT
    sb.SourceBookId,
    sb.Name AS SourceBookName,
    sb.SourcePurchaseID,
    sbp.Name AS PurchaseName,
    sbp.StoreUrl,
    sbp.Price
FROM pf2.SourceBook sb
LEFT JOIN pf2.SourceBookPurchase sbp
  ON sbp.SourceBookPurchaseId = sb.SourcePurchaseID
ORDER BY sb.Name;
GO

SELECT
    COUNT(*) AS TotalSourceBooks,
    SUM(CASE WHEN SourcePurchaseID IS NOT NULL THEN 1 ELSE 0 END) AS LinkedSourceBooks,
    SUM(CASE WHEN SourcePurchaseID IS NULL THEN 1 ELSE 0 END) AS UnlinkedSourceBooks
FROM pf2.SourceBook;
GO
`;

fs.writeFileSync(new URL('./update_source_book_purchase_ids.sql', import.meta.url), updateSql, 'utf8');
console.log(`Wrote update_source_book_purchase_ids.sql (${sourceLinks.length} mappings)`);
