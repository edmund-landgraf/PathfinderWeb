import sql from 'mssql';
import { getPool } from '../src/db.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dryRun = process.argv.includes('--dry-run');
const linkBooks = !process.argv.includes('--no-link');
const maxIdArg = Number(process.argv.find((a) => a.startsWith('--max-id='))?.split('=')[1] || 0);
const startIdArg = Number(process.argv.find((a) => a.startsWith('--start-id='))?.split('=')[1] || 1);
const delayMs = Number(process.argv.find((a) => a.startsWith('--delay='))?.split('=')[1] || 250);

function decodeHtml(value) {
  return String(value || '')
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

function canonicalUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function normalizeUrl(url) {
  return canonicalUrl(url).toLowerCase();
}

async function fetchAonSource(id) {
  const res = await fetch(`https://2e.aonprd.com/Sources.aspx?ID=${id}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) pf2-aon-source-sync/1.0' }
  });

  if (res.status === 404) {
    return { aonId: id, ok: false, status: 404 };
  }

  const html = await res.text();
  const h1Match = html.match(/<h1 class="title"><a href="Sources\.aspx\?ID=\d+">([^<]+)<\/a><\/h1>/i);
  const productMatch = html.match(/<b>Product Page<\/b>\s*<u><a href="([^"]+)"/i);

  if (!h1Match) {
    return { aonId: id, ok: false, status: res.status };
  }

  return {
    aonId: id,
    ok: true,
    status: res.status,
    name: decodeHtml(h1Match[1]),
    productUrl: productMatch?.[1] ? canonicalUrl(productMatch[1].replace(/&amp;/g, '&')) : null
  };
}

async function fetchProduct(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) pf2-aon-source-sync/1.0' }
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

async function detectMaxId() {
  let low = 1;
  let high = 500;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const row = await fetchAonSource(mid);
    if (row.ok) low = mid;
    else high = mid - 1;
    await sleep(150);
  }

  return low;
}

async function getOrCreatePurchase(pool, storeUrl, fallbackName, purchaseByUrl) {
  const key = normalizeUrl(storeUrl);
  const existing = purchaseByUrl.get(key);
  if (existing) {
    return { ...existing, created: false };
  }

  let product = {
    name: fallbackName,
    price: null,
    description: null
  };

  if (/store\.paizo\.com/i.test(storeUrl)) {
    try {
      product = await fetchProduct(storeUrl);
    } catch (err) {
      process.stderr.write(`  warn: product fetch failed (${err.message}), using AoN source name\n`);
    }
  }

  if (dryRun) {
    const row = {
      SourceBookPurchaseId: null,
      Name: product.name,
      StoreUrl: storeUrl,
      Price: product.price,
      created: true,
      dryRun: true
    };
    purchaseByUrl.set(key, row);
    return row;
  }

  const inserted = await pool.request()
    .input('Name', sql.NVarChar(500), product.name.slice(0, 500))
    .input('StoreUrl', sql.NVarChar(1000), storeUrl)
    .input('LongDescription', sql.NVarChar(sql.MAX), product.description)
    .input('Price', sql.Decimal(10, 2), product.price)
    .query(`
      INSERT INTO pf2.SourceBookPurchase (Name, StoreUrl, LongDescription, Price)
      OUTPUT INSERTED.SourceBookPurchaseId, INSERTED.Name, INSERTED.StoreUrl, INSERTED.Price
      VALUES (@Name, @StoreUrl, @LongDescription, @Price)
    `);

  const row = { ...inserted.recordset[0], created: true };
  purchaseByUrl.set(key, row);
  return row;
}

async function linkSourceBook(pool, sourceBookId, purchaseId) {
  if (dryRun) return;

  await pool.request()
    .input('SourceBookId', sql.Int, sourceBookId)
    .input('SourcePurchaseID', sql.Int, purchaseId)
    .query(`
      UPDATE pf2.SourceBook
      SET SourcePurchaseID = @SourcePurchaseID
      WHERE SourceBookId = @SourceBookId
        AND SourcePurchaseID IS NULL
    `);
}

const summary = {
  maxAonId: null,
  scanned: 0,
  validSources: 0,
  withProductUrl: 0,
  purchasesCreated: 0,
  purchasesReused: 0,
  booksLinked: 0,
  skippedNoProductUrl: 0,
  skippedMissingSourceBook: 0,
  failures: 0,
  rows: []
};

try {
  const pool = await getPool();

  const schemaCheck = await pool.request().query(`
    SELECT OBJECT_ID(N'pf2.SourceBookPurchase', N'U') AS HasPurchaseTable
  `);
  if (!schemaCheck.recordset[0].HasPurchaseTable) {
    throw new Error('Run server/scripts/create_source_book_purchase.sql first.');
  }

  const purchaseRows = await pool.request().query(`
    SELECT SourceBookPurchaseId, Name, StoreUrl, Price
    FROM pf2.SourceBookPurchase
  `);
  const purchaseByUrl = new Map(
    purchaseRows.recordset.map((row) => [normalizeUrl(row.StoreUrl), row])
  );

  const sourceBooks = await pool.request().query(`
    SELECT SourceBookId, Name, SourcePurchaseID
    FROM pf2.SourceBook
  `);
  const sourceBookByName = new Map(
    sourceBooks.recordset.map((row) => [row.Name, row])
  );

  const maxId = maxIdArg > 0 ? maxIdArg : await detectMaxId();
  summary.maxAonId = maxId;
  process.stderr.write(`Scanning AoN Sources.aspx IDs ${startIdArg}..${maxId}\n`);
  if (dryRun) process.stderr.write('DRY RUN: no database writes\n');

  for (let aonId = startIdArg; aonId <= maxId; aonId += 1) {
    summary.scanned += 1;
    process.stderr.write(`[${aonId}/${maxId}] fetching ID ${aonId}\n`);

    try {
      const source = await fetchAonSource(aonId);
      if (!source.ok) {
        summary.rows.push({ aonId, status: 'missing' });
        await sleep(delayMs);
        continue;
      }

      summary.validSources += 1;

      if (!source.productUrl) {
        summary.skippedNoProductUrl += 1;
        summary.rows.push({
          aonId,
          sourceName: source.name,
          status: 'no_product_url'
        });
        await sleep(delayMs);
        continue;
      }

      summary.withProductUrl += 1;
      const hadPurchase = purchaseByUrl.has(normalizeUrl(source.productUrl));
      const purchase = await getOrCreatePurchase(pool, source.productUrl, source.name, purchaseByUrl);

      if (purchase.created) summary.purchasesCreated += 1;
      else summary.purchasesReused += 1;

      let linked = false;
      const book = sourceBookByName.get(source.name);
      if (book && linkBooks && !book.SourcePurchaseID && purchase.SourceBookPurchaseId) {
        await linkSourceBook(pool, book.SourceBookId, purchase.SourceBookPurchaseId);
        book.SourcePurchaseID = purchase.SourceBookPurchaseId;
        linked = true;
        summary.booksLinked += 1;
      } else if (!book) {
        summary.skippedMissingSourceBook += 1;
      }

      summary.rows.push({
        aonId,
        sourceName: source.name,
        status: purchase.created
          ? (dryRun ? 'would_create_purchase' : 'created_purchase')
          : (hadPurchase ? 'purchase_exists' : 'purchase_reused'),
        storeUrl: source.productUrl,
        purchaseId: purchase.SourceBookPurchaseId,
        purchaseName: purchase.Name,
        sourceBookId: book?.SourceBookId ?? null,
        linked
      });
    } catch (err) {
      summary.failures += 1;
      summary.rows.push({ aonId, status: 'error', error: err.message });
      process.stderr.write(`  error: ${err.message}\n`);
    }

    await sleep(delayMs);
  }

  if (!dryRun) {
    const counts = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM pf2.SourceBookPurchase) AS PurchaseRows,
        SUM(CASE WHEN SourcePurchaseID IS NOT NULL THEN 1 ELSE 0 END) AS LinkedSourceBooks,
        SUM(CASE WHEN SourcePurchaseID IS NULL THEN 1 ELSE 0 END) AS UnlinkedSourceBooks
      FROM pf2.SourceBook
    `);
    summary.database = counts.recordset[0];
  }

  console.log(JSON.stringify(summary, null, 2));
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}

process.exit(0);
