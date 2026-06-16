import fs from 'fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeHtml(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sqlString(value) {
  if (value == null || value === '') return 'NULL';
  return `N'${String(value).replace(/'/g, "''")}'`;
}

function normalizeUrl(url) {
  return String(url || '')
    .trim()
    .replace(/\/+$/, '')
    .toLowerCase();
}

async function fetchProduct(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) pf2-source-match/1.0' }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  const html = await res.text();
  const jsonLdMatches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];

  for (const m of jsonLdMatches) {
    try {
      const data = JSON.parse(m[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] !== 'Product' && !item.name) continue;
        const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
        return {
          name: decodeHtml(item.name),
          price: offer?.price != null ? Number(offer.price) : null,
          description: decodeHtml(item.description)
        };
      }
    } catch {
      // continue
    }
  }

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const price = html.match(/data-product-price-without-tax="([^"]+)"/i)
    || html.match(/"price"\s*:\s*"([0-9.]+)"/i);
  return {
    name: decodeHtml(h1?.[1]?.replace(/<[^>]+>/g, '').trim()) || url,
    price: price?.[1] != null ? Number(price[1]) : null,
    description: null
  };
}

const buf = fs.readFileSync(new URL('./match_results.json', import.meta.url));
const raw = buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le') : buf.toString('utf8');
const matches = JSON.parse(raw.slice(raw.indexOf('[')));

function canonicalUrl(url) {
  const trimmed = String(url || '').trim();
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

const urlSet = new Map();

for (const row of matches) {
  for (const url of [row.BestMatchURL, ...(row.AltMatches || []).map((a) => a.url)]) {
    if (!url) continue;
    urlSet.set(normalizeUrl(url), canonicalUrl(url));
  }
}

const urls = [...urlSet.values()].sort();
const products = [];
const failures = [];

for (let i = 0; i < urls.length; i += 1) {
  const url = urls[i];
  process.stderr.write(`[${i + 1}/${urls.length}] ${url}\n`);
  try {
    const product = await fetchProduct(url);
    products.push({ url, ...product });
  } catch (err) {
    failures.push({ url, error: err.message });
    products.push({
      url,
      name: url.replace('https://store.paizo.com/', '').replace(/\/$/, '').replace(/-/g, ' '),
      price: null,
      description: null
    });
  }
  await sleep(350);
}

const sourceLinks = matches
  .filter((row) => row.BestMatchURL && row.BestScore > 25)
  .map((row) => ({
    sourceBookId: row.SourceBookId,
    sourceBookName: row.Name,
    storeUrl: row.BestMatchURL.endsWith('/') ? row.BestMatchURL : `${row.BestMatchURL}/`
  }));

const insertLines = products.map((p) => {
  const priceSql = p.price == null || Number.isNaN(p.price) ? 'NULL' : p.price.toFixed(2);
  return `    (${sqlString(p.name)}, ${sqlString(p.url)}, ${sqlString(p.description)}, ${priceSql})`;
});

const seedSql = `-- Seed pf2.SourceBookPurchase from Paizo store product pages.
-- Generated ${new Date().toISOString()}
-- Products: ${products.length}, fetch failures: ${failures.length}

USE PathfinderUtil;
GO

SET NOCOUNT ON;
GO

IF OBJECT_ID(N'pf2.SourceBookPurchase', N'U') IS NULL
BEGIN
    RAISERROR('Run create_source_book_purchase.sql first.', 16, 1);
    RETURN;
END
GO

UPDATE sb
SET sb.SourcePurchaseID = NULL
FROM pf2.SourceBook sb;
GO

DELETE FROM pf2.SourceBookPurchase;
GO

DBCC CHECKIDENT ('pf2.SourceBookPurchase', RESEED, 0);
GO

INSERT INTO pf2.SourceBookPurchase (Name, StoreUrl, LongDescription, Price)
VALUES
${insertLines.join(',\n')};
GO

SELECT COUNT(*) AS SourceBookPurchaseCount FROM pf2.SourceBookPurchase;
GO
`;

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
${sourceLinks
  .map(
    (row, index) =>
      `        (${row.sourceBookId}, ${sqlString(row.storeUrl)})${index < sourceLinks.length - 1 ? ',' : ''} -- ${row.sourceBookName.replace(/'/g, "''")}`
  )
  .join('\n')}
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

const createSql = `-- Create pf2.SourceBookPurchase and replace SourceBook.SourcePurchaseURL with SourcePurchaseID.
-- Run in SSMS or: sqlcmd -S localhost -d PathfinderUtil -E -i create_source_book_purchase.sql

USE PathfinderUtil;
GO

SET NOCOUNT ON;
GO

IF OBJECT_ID(N'pf2.SourceBookPurchase', N'U') IS NULL
BEGIN
    CREATE TABLE pf2.SourceBookPurchase
    (
        SourceBookPurchaseId INT IDENTITY(1,1) NOT NULL,
        Name                 NVARCHAR(500) NOT NULL,
        StoreUrl             NVARCHAR(1000) NOT NULL,
        LongDescription      NVARCHAR(MAX) NULL,
        Price                DECIMAL(10, 2) NULL,
        CONSTRAINT PK_SourceBookPurchase PRIMARY KEY CLUSTERED (SourceBookPurchaseId),
        CONSTRAINT UQ_SourceBookPurchase_StoreUrl UNIQUE (StoreUrl)
    );
END
GO

IF COL_LENGTH('pf2.SourceBook', 'SourcePurchaseURL') IS NOT NULL
   AND COL_LENGTH('pf2.SourceBook', 'SourcePurchaseID') IS NULL
BEGIN
    ALTER TABLE pf2.SourceBook DROP COLUMN SourcePurchaseURL;
END
GO

IF COL_LENGTH('pf2.SourceBook', 'SourcePurchaseID') IS NULL
BEGIN
    ALTER TABLE pf2.SourceBook
        ADD SourcePurchaseID INT NULL;
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = N'FK_SourceBook_SourceBookPurchase'
)
BEGIN
    ALTER TABLE pf2.SourceBook
        ADD CONSTRAINT FK_SourceBook_SourceBookPurchase
            FOREIGN KEY (SourcePurchaseID)
            REFERENCES pf2.SourceBookPurchase (SourceBookPurchaseId);
END
GO

SELECT
    c.name AS ColumnName,
    t.name AS DataType,
    c.is_nullable AS IsNullable
FROM sys.columns c
INNER JOIN sys.types t
  ON t.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID(N'pf2.SourceBook')
  AND c.name IN (N'SourcePurchaseURL', N'SourcePurchaseID')
ORDER BY c.name;
GO

SELECT
    c.name AS ColumnName,
    t.name AS DataType,
    c.is_nullable AS IsNullable,
    c.is_identity AS IsIdentity
FROM sys.columns c
INNER JOIN sys.types t
  ON t.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID(N'pf2.SourceBookPurchase')
ORDER BY c.column_id;
GO
`;

fs.writeFileSync(new URL('./create_source_book_purchase.sql', import.meta.url), createSql, 'utf8');
fs.writeFileSync(new URL('./seed_source_book_purchase.sql', import.meta.url), seedSql, 'utf8');
fs.writeFileSync(new URL('./update_source_book_purchase_ids.sql', import.meta.url), updateSql, 'utf8');
fs.writeFileSync(
  new URL('./source_book_purchase_products.json', import.meta.url),
  JSON.stringify({ products, failures, sourceLinks }, null, 2),
  'utf8'
);

console.log(`URLs: ${urls.length}`);
console.log(`Products: ${products.length}`);
console.log(`Source book links: ${sourceLinks.length}`);
console.log(`Failures: ${failures.length}`);
console.log('Wrote create_source_book_purchase.sql');
console.log('Wrote seed_source_book_purchase.sql');
console.log('Wrote update_source_book_purchase_ids.sql');
