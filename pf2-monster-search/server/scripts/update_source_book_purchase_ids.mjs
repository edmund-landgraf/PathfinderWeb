import sql from 'mssql';
import { getPool } from '../src/db.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dryRun = process.argv.includes('--dry-run');
const limitArg = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || 0);
const minScoreArg = Number(process.argv.find((a) => a.startsWith('--min-score='))?.split('=')[1] || 50);

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, '')
    .replace(/&#x27;|&apos;/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenSet(text) {
  return new Set(normalize(text).split(/\s+/).filter((t) => t.length > 1));
}

function canonicalUrl(url) {
  const trimmed = String(url || '').trim();
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

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

function scoreMatch(sourceName, candidateTitle, candidateUrl) {
  const src = normalize(sourceName);
  const title = normalize(candidateTitle);
  const url = normalize(candidateUrl.replace(/https?:\/\/store\.paizo\.com\//, '').replace(/\/+$/, ''));

  if (!title && !url) return 0;

  let score = 0;

  if (title === src) score += 100;
  if (title.includes(src) || src.includes(title)) score += 50;

  const srcTokens = tokenSet(sourceName);
  const titleTokens = tokenSet(candidateTitle);
  const urlTokens = tokenSet(candidateUrl);

  let overlap = 0;
  for (const t of srcTokens) {
    if (titleTokens.has(t) || urlTokens.has(t)) overlap += 1;
  }
  score += overlap * 10;

  const apMatch = sourceName.match(/Pathfinder\s+#(\d+):\s*(.+)/i);
  if (apMatch) {
    const num = apMatch[1];
    const subtitle = normalize(apMatch[2]);
    if (url.includes(` ${num} `) || url.includes(`-${num}-`) || url.includes(`-${num}`)) score += 30;
    if (title.includes(`#${num}`) || title.includes(` ${num} `)) score += 25;
    if (title.includes(subtitle) || url.includes(subtitle.replace(/\s+/g, '-'))) score += 35;
  }

  if (/pdf|pawn|battle cards|flip-mat|foundry|bundle|poster map folio|gm screen|subscription|download|tokens|miniatures|case|code/i.test(candidateTitle)) {
    score -= 20;
  }
  if (/hardcover|pocket edition|special edition|sketch edition/i.test(candidateTitle)) {
    score += 8;
  }
  if (/lost omens/i.test(sourceName) && /lost omens/i.test(candidateTitle)) score += 15;
  if (/player'?s guide/i.test(sourceName) && /player'?s guide/i.test(candidateTitle)) score += 20;

  return score;
}

async function storeSearch(query) {
  const url = `https://store.paizo.com/search.php?search_query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) pf2-source-match/1.0' }
  });
  if (!res.ok) return [];

  const html = await res.text();
  const re = /class="card-title"[\s\S]*?<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  const seen = new Set();
  const results = [];

  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].replace(/&amp;/g, '&').split('?')[0];
    const title = m[2].replace(/&amp;/g, '&').replace(/&#x27;/g, "'").trim();
    const key = href.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ url: canonicalUrl(href), title });
  }

  return results;
}

function buildQueries(name) {
  const queries = [name];
  const ap = name.match(/Pathfinder\s+#(\d+):\s*(.+)/i);
  if (ap) {
    queries.unshift(`Pathfinder Adventure Path ${ap[1]} ${ap[2]}`);
    queries.unshift(`Pathfinder #${ap[1]} ${ap[2]}`);
  } else if (/hardcover/i.test(name)) {
    queries.unshift(name.replace(/\s*\(Hardcover\)\s*/i, ''));
    queries.unshift(name.replace(/\s*\(Hardcover\)\s*/i, ' Adventure Path'));
  } else if (/player'?s guide/i.test(name)) {
    queries.unshift(`Pathfinder ${name}`);
  } else {
    queries.unshift(`Pathfinder ${name}`);
    if (/remastered/i.test(name)) {
      queries.unshift(name.replace(/\s*\(Remastered\)\s*/i, ''));
    }
  }
  return [...new Set(queries)];
}

async function findBestMatch(sourceBookName) {
  const queries = buildQueries(sourceBookName);
  const candidates = [];

  for (const q of queries) {
    const hits = await storeSearch(q);
    for (const hit of hits.slice(0, 12)) {
      candidates.push({
        ...hit,
        score: scoreMatch(sourceBookName, hit.title, hit.url),
        query: q
      });
    }
    if (candidates.some((c) => c.score >= 80)) break;
    await sleep(350);
  }

  candidates.sort((a, b) => b.score - a.score);

  const deduped = [];
  const seen = new Set();
  for (const c of candidates) {
    const key = c.url.replace(/\/+$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }

  return deduped[0] || null;
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

async function getOrCreatePurchase(pool, match, fallbackTitle) {
  const storeUrl = canonicalUrl(match.url);
  const existing = await pool.request()
    .input('StoreUrl', sql.NVarChar(1000), storeUrl)
    .query(`
      SELECT SourceBookPurchaseId, Name, StoreUrl, Price
      FROM pf2.SourceBookPurchase
      WHERE StoreUrl = @StoreUrl
    `);

  if (existing.recordset.length > 0) {
    return { ...existing.recordset[0], created: false };
  }

  let product;
  try {
    product = await fetchProduct(storeUrl);
  } catch (err) {
    product = {
      name: fallbackTitle || match.title,
      price: null,
      description: null
    };
    process.stderr.write(`  warn: product fetch failed (${err.message}), using search title\n`);
  }

  if (dryRun) {
    return {
      SourceBookPurchaseId: null,
      Name: product.name,
      StoreUrl: storeUrl,
      Price: product.price,
      created: true,
      dryRun: true
    };
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

  return { ...inserted.recordset[0], created: true };
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
    `);
}

const summary = {
  scanned: 0,
  linked: 0,
  skippedLowScore: 0,
  skippedNoMatch: 0,
  purchasesCreated: 0,
  purchasesReused: 0,
  failures: 0,
  rows: []
};

try {
  const pool = await getPool();

  const schemaCheck = await pool.request().query(`
    SELECT
      COL_LENGTH('pf2.SourceBook', 'SourcePurchaseID') AS HasSourcePurchaseID,
      OBJECT_ID(N'pf2.SourceBookPurchase', N'U') AS HasPurchaseTable
  `);

  const { HasSourcePurchaseID, HasPurchaseTable } = schemaCheck.recordset[0];
  if (!HasPurchaseTable || !HasSourcePurchaseID) {
    throw new Error('Run server/scripts/create_source_book_purchase.sql first.');
  }

  let nullRows = await pool.request().query(`
    SELECT SourceBookId, Name, SourcePurchaseID
    FROM pf2.SourceBook
    WHERE SourcePurchaseID IS NULL
    ORDER BY Name
  `);

  if (limitArg > 0) {
    nullRows.recordset = nullRows.recordset.slice(0, limitArg);
  }

  process.stderr.write(`Found ${nullRows.recordset.length} SourceBook rows with NULL SourcePurchaseID\n`);
  if (dryRun) process.stderr.write('DRY RUN: no database writes\n');

  for (let i = 0; i < nullRows.recordset.length; i += 1) {
    const book = nullRows.recordset[i];
    summary.scanned += 1;
    process.stderr.write(`[${i + 1}/${nullRows.recordset.length}] ${book.Name}\n`);

    try {
      const match = await findBestMatch(book.Name);
      if (!match || match.score < minScoreArg) {
        if (!match) summary.skippedNoMatch += 1;
        else summary.skippedLowScore += 1;

        summary.rows.push({
          sourceBookId: book.SourceBookId,
          sourceBookName: book.Name,
          status: !match ? 'no_match' : 'low_score',
          score: match?.score || 0,
          purchaseId: null,
          storeUrl: match?.url || null,
          purchaseName: match?.title || null
        });
        await sleep(400);
        continue;
      }

      const purchase = await getOrCreatePurchase(pool, match, match.title);
      if (purchase.created) summary.purchasesCreated += 1;
      else summary.purchasesReused += 1;

      if (!dryRun) {
        await linkSourceBook(pool, book.SourceBookId, purchase.SourceBookPurchaseId);
        summary.linked += 1;
      }

      summary.rows.push({
        sourceBookId: book.SourceBookId,
        sourceBookName: book.Name,
        status: dryRun ? 'would_link' : 'linked',
        score: match.score,
        purchaseId: purchase.SourceBookPurchaseId,
        storeUrl: purchase.StoreUrl,
        purchaseName: purchase.Name,
        createdPurchase: purchase.created
      });
    } catch (err) {
      summary.failures += 1;
      summary.rows.push({
        sourceBookId: book.SourceBookId,
        sourceBookName: book.Name,
        status: 'error',
        error: err.message
      });
      process.stderr.write(`  error: ${err.message}\n`);
    }

    await sleep(400);
  }

  if (!dryRun) {
    const counts = await pool.request().query(`
      SELECT
        COUNT(*) AS TotalSourceBooks,
        SUM(CASE WHEN SourcePurchaseID IS NOT NULL THEN 1 ELSE 0 END) AS LinkedSourceBooks,
        SUM(CASE WHEN SourcePurchaseID IS NULL THEN 1 ELSE 0 END) AS UnlinkedSourceBooks,
        (SELECT COUNT(*) FROM pf2.SourceBookPurchase) AS PurchaseRows
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
