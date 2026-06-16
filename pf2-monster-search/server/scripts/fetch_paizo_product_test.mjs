const url = process.argv[2] || 'https://store.paizo.com/pathfinder-monster-core/';

const res = await fetch(url, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) pf2-source-match/1.0' }
});
const html = await res.text();

function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
}

const jsonLdMatches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
for (const m of jsonLdMatches) {
  try {
    const data = JSON.parse(m[1]);
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      if (item['@type'] === 'Product' || item.name) {
        console.log('JSON-LD Product:', {
          name: item.name,
          price: item.offers?.price ?? item.offers?.[0]?.price,
          description: String(item.description || '').slice(0, 200)
        });
      }
    }
  } catch {
    // ignore
  }
}

const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
const price = html.match(/data-product-price-without-tax="([^"]+)"/i)
  || html.match(/"price"\s*:\s*"([0-9.]+)"/i)
  || html.match(/\$([0-9]+\.[0-9]{2})/);
const descBlock = html.match(/class="productView-description"[\s\S]*?<p>([\s\S]*?)<\/p>/i)
  || html.match(/itemprop="description"[^>]*>([\s\S]*?)<\//i);

console.log('H1:', decodeHtml(h1?.[1]?.replace(/<[^>]+>/g, '').trim()));
console.log('Price:', price?.[1]);
console.log('Desc:', decodeHtml(descBlock?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())?.slice(0, 300));
