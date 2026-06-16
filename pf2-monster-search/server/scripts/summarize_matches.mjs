import fs from 'fs';

const buf = fs.readFileSync(new URL('./match_results.json', import.meta.url));
const raw = buf[0] === 0xff && buf[1] === 0xfe
  ? buf.toString('utf16le')
  : buf.toString('utf8');
const start = raw.indexOf('[');
const data = JSON.parse(raw.slice(start));

const summary = {
  total: data.length,
  high: data.filter((r) => r.Confidence === 'high').length,
  medium: data.filter((r) => r.Confidence === 'medium').length,
  low: data.filter((r) => r.Confidence === 'low').length,
  none: data.filter((r) => r.Confidence === 'none').length
};

console.log('Summary:', summary);

const rows = data.map((r) => ({
  id: r.SourceBookId,
  name: r.Name,
  current: r.CurrentURL || '',
  match: r.BestMatchTitle || '',
  url: r.BestMatchURL || '',
  score: r.BestScore,
  confidence: r.Confidence,
  alt1: r.AltMatches[0]?.title || '',
  alt1Url: r.AltMatches[0]?.url || '',
  alt2: r.AltMatches[1]?.title || '',
  alt2Url: r.AltMatches[1]?.url || ''
}));

fs.writeFileSync(new URL('./match_results_table.json', import.meta.url), JSON.stringify({ summary, rows }, null, 2));
console.log('Wrote match_results_table.json');
