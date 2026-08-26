import sql from 'mssql';
import { getPool } from '../src/db.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dryRun = process.argv.includes('--dry-run');
const rebuild = process.argv.includes('--rebuild');
const fullRange = process.argv.includes('--full-range');
const maxIdArg = Number(process.argv.find((a) => a.startsWith('--max-id='))?.split('=')[1] || 0);
const startIdArg = Number(process.argv.find((a) => a.startsWith('--start-id='))?.split('=')[1] || 1);
const delayMs = Number(process.argv.find((a) => a.startsWith('--delay='))?.split('=')[1] || 250);
const batchSize = Number(process.argv.find((a) => a.startsWith('--batch-size='))?.split('=')[1] || 5);
const batchPauseMs = Number(process.argv.find((a) => a.startsWith('--batch-pause='))?.split('=')[1] || 5000);

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
  if (!trimmed) return null;
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function parseReleaseDate(text) {
  const value = decodeHtml(text);
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

async function fetchAonSource(id) {
  const res = await fetch(`https://2e.aonprd.com/Sources.aspx?ID=${id}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) pf2-source-book-aon/1.0' }
  });

  if (res.status === 404) {
    return { aonId: id, ok: false, status: 404 };
  }

  const html = await res.text();
  const h1Match = html.match(/<h1 class="title"><a href="Sources\.aspx\?ID=\d+">([^<]+)<\/a><\/h1>/i);
  if (!h1Match) {
    return { aonId: id, ok: false, status: res.status };
  }

  const productMatch = html.match(/<b>Product Page<\/b>\s*<u><a href="([^"]+)"/i);
  const releaseMatch = html.match(/<b>Release Date<\/b>\s*([^<]+)/i);
  const lineMatch = html.match(/<b>Product Line<\/b>\s*([^<]+)/i);

  return {
    aonId: id,
    ok: true,
    status: res.status,
    name: decodeHtml(h1Match[1]),
    productPageUrl: productMatch?.[1] ? canonicalUrl(productMatch[1].replace(/&amp;/g, '&')) : null,
    releaseDate: releaseMatch?.[1] ? parseReleaseDate(releaseMatch[1]) : null,
    productLine: lineMatch?.[1] ? decodeHtml(lineMatch[1]) : null
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

async function upsertSourceBookAoN(pool, row) {
  if (dryRun) return { action: 'would_upsert' };

  await pool.request()
    .input('AonSourceId', sql.Int, row.aonId)
    .input('Name', sql.NVarChar(500), row.name.slice(0, 500))
    .input('ProductPageUrl', sql.NVarChar(1000), row.productPageUrl)
    .input('ReleaseDate', sql.Date, row.releaseDate)
    .input('ProductLine', sql.NVarChar(200), row.productLine?.slice(0, 200) ?? null)
    .query(`
      MERGE pf2.SourceBookAoN AS target
      USING (SELECT @AonSourceId AS AonSourceId) AS source
        ON target.AonSourceId = source.AonSourceId
      WHEN MATCHED THEN
        UPDATE SET
          Name = @Name,
          ProductPageUrl = @ProductPageUrl,
          ReleaseDate = @ReleaseDate,
          ProductLine = @ProductLine
      WHEN NOT MATCHED THEN
        INSERT (AonSourceId, Name, ProductPageUrl, ReleaseDate, ProductLine)
        VALUES (@AonSourceId, @Name, @ProductPageUrl, @ReleaseDate, @ProductLine);
    `);

  return { action: 'upserted' };
}

const summary = {
  mode: fullRange ? 'full-range' : 'until-error',
  maxAonId: null,
  scanned: 0,
  validSources: 0,
  upserted: 0,
  missing: 0,
  failures: 0,
  rows: []
};

try {
  const pool = await getPool();

  const schemaCheck = await pool.request().query(`
    SELECT OBJECT_ID(N'pf2.SourceBookAoN', N'U') AS HasTable
  `);
  if (!schemaCheck.recordset[0].HasTable) {
    throw new Error('Run server/scripts/create_source_book_aon.sql first.');
  }

  if (rebuild && !dryRun) {
    await pool.request().query('DELETE FROM pf2.SourceBookAoN');
    process.stderr.write('Cleared pf2.SourceBookAoN\n');
  }

  let endId = null;
  if (fullRange) {
    endId = maxIdArg > 0 ? maxIdArg : await detectMaxId();
    summary.maxAonId = endId;
    process.stderr.write(`Scanning AoN Sources.aspx IDs ${startIdArg}..${endId}\n`);
  } else {
    process.stderr.write(`Scanning AoN Sources.aspx from ID ${startIdArg} until first missing page\n`);
  }

  if (dryRun) process.stderr.write('DRY RUN: no database writes\n');

  for (let aonId = startIdArg; ; aonId += 1) {
    if (fullRange && aonId > endId) break;

    summary.scanned += 1;
    process.stderr.write(`[${aonId}${endId ? `/${endId}` : ''}] fetching ID ${aonId}\n`);

    try {
      const source = await fetchAonSource(aonId);
      if (!source.ok) {
        summary.missing += 1;
        summary.rows.push({ aonId, status: 'missing' });
        if (!fullRange) {
          summary.maxAonId = aonId - 1;
          process.stderr.write(`Stopped at ID ${aonId} (page missing)\n`);
          break;
        }
        await sleep(delayMs);
        continue;
      }

      summary.validSources += 1;
      const result = await upsertSourceBookAoN(pool, source);
      if (result.action === 'upserted') summary.upserted += 1;

      summary.rows.push({
        aonId: source.aonId,
        name: source.name,
        productPageUrl: source.productPageUrl,
        releaseDate: source.releaseDate?.toISOString().slice(0, 10) ?? null,
        productLine: source.productLine,
        status: dryRun ? 'would_upsert' : 'upserted'
      });
    } catch (err) {
      summary.failures += 1;
      summary.rows.push({ aonId, status: 'error', error: err.message });
      process.stderr.write(`  error: ${err.message}\n`);
      if (!fullRange) break;
    }

    await sleep(delayMs);

    if (summary.scanned % batchSize === 0) {
      process.stderr.write(`  pausing ${batchPauseMs}ms after ${batchSize} loads\n`);
      await sleep(batchPauseMs);
    }
  }

  if (!dryRun) {
    const counts = await pool.request().query(`
      SELECT COUNT(*) AS SourceBookAoNRows FROM pf2.SourceBookAoN
    `);
    summary.database = counts.recordset[0];
  }

  console.log(JSON.stringify(summary, null, 2));
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}

process.exit(0);
