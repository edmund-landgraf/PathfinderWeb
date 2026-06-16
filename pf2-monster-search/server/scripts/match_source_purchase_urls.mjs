import { getPool } from '../src/db.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const limitArg = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || 0);

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
    results.push({ url: href, title });
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
  } else if (/^Pathfinder Lost Omens /i.test(name)) {
    queries.unshift(name);
  } else if (/^Pathfinder /i.test(name)) {
    queries.unshift(name);
  } else if (/Player'?s Guide/i.test(name)) {
    queries.unshift(`Pathfinder ${name}`);
  } else {
    queries.unshift(`Pathfinder ${name}`);
    if (/remastered/i.test(name)) {
      queries.unshift(name.replace(/\s*\(Remastered\)\s*/i, ''));
    }
  }
  return [...new Set(queries)];
}

async function findMatches(sourceBook) {
  const queries = buildQueries(sourceBook.Name);
  const candidates = [];

  for (const q of queries) {
    const hits = await storeSearch(q);
    for (const hit of hits.slice(0, 12)) {
      candidates.push({
        ...hit,
        score: scoreMatch(sourceBook.Name, hit.title, hit.url),
        query: q
      });
    }
    if (candidates.some((c) => c.score >= 60)) break;
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

  return deduped.slice(0, 3);
}

try {
  const pool = await getPool();
  const rows = await pool.request().query(`
    SELECT SourceBookId, Name, SourcePurchaseURL
    FROM pf2.SourceBook
    ORDER BY Name
  `);

  const results = [];
  const books = limitArg > 0 ? rows.recordset.slice(0, limitArg) : rows.recordset;

  for (let i = 0; i < books.length; i += 1) {
    const book = books[i];
    process.stderr.write(`[${i + 1}/${books.length}] ${book.Name}\n`);
    const matches = await findMatches(book);
    const best = matches[0] || null;

    results.push({
      SourceBookId: book.SourceBookId,
      Name: book.Name,
      CurrentURL: book.SourcePurchaseURL,
      BestMatchURL: best?.score > 25 ? best.url : null,
      BestMatchTitle: best?.score > 25 ? best.title : null,
      BestScore: best?.score || 0,
      Confidence: best?.score >= 80 ? 'high' : best?.score >= 50 ? 'medium' : best?.score > 25 ? 'low' : 'none',
      AltMatches: matches
        .slice(1)
        .filter((m) => m.score > 25)
        .map((m) => ({ url: m.url, title: m.title, score: m.score }))
    });

    await sleep(400);
  }

  console.log(JSON.stringify(results, null, 2));
} catch (err) {
  console.error(err);
  process.exit(1);
}

process.exit(0);
