const query = process.argv[2] || 'Pathfinder Monster Core';
const url = `https://store.paizo.com/search.php?search_query=${encodeURIComponent(query)}`;
const res = await fetch(url, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) pf2-source-match/1.0' }
});
console.log('status', res.status);
const html = await res.text();
console.log('len', html.length);
const re = /class="card-title"[\s\S]*?<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
let m, n = 0;
while ((m = re.exec(html)) !== null && n < 8) {
  console.log(m[2].trim(), '->', m[1].split('?')[0]);
  n++;
}
