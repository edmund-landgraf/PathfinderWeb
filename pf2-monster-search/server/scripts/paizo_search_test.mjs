const query = process.argv[2] || 'Monster Core';

const url = `https://paizo.com/search.php?search_query=${encodeURIComponent(query)}`;
const res = await fetch(url, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) pf2-monster-search/1.0' }
});
const html = await res.text();
console.log('Status:', res.status, 'Length:', html.length);

const productRe = /<a[^>]+href="(\/products\/[^"]+)"[^>]*>\s*([^<]+)/gi;
const titleRe = /<h3[^>]*>\s*<a[^>]+href="(\/products\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
const cardRe = /class="card-title"[\s\S]*?href="(\/products\/[^"]+)"[\s\S]*?>([^<]+)</gi;

const seen = new Set();
const matches = [];

for (const re of [titleRe, cardRe, productRe]) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const title = m[2].replace(/\s+/g, ' ').trim();
    if (!title || title.length < 3) continue;
    const key = href.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({ title, url: `https://paizo.com${href}` });
  }
}

console.log(`Matches for "${query}":`, matches.length);
for (const item of matches.slice(0, 8)) {
  console.log(`  - ${item.title}`);
  console.log(`    ${item.url}`);
}
