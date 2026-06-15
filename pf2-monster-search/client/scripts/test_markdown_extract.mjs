import {
  extractMarkdownDescriptionMonster,
  extractMarkdownDescriptionFeatsEquipSpells,
  extractMarkdownRemainderFeatsEquipSpells
} from '../src/markdownExtract.js';

const API_BASE = process.env.API_BASE || 'http://localhost:3333';

const samples = [
  { entity: 'monsters', name: 'Abrikandilu', extract: extractMarkdownDescriptionMonster },
  { entity: 'feats', name: 'Yamaraj', extract: extractMarkdownDescriptionFeatsEquipSpells },
  { entity: 'spells', name: 'fireball', extract: extractMarkdownDescriptionFeatsEquipSpells },
  { entity: 'equipment', name: 'longsword', extract: extractMarkdownDescriptionFeatsEquipSpells }
];

const failures = [];

for (const sample of samples) {
  const url = new URL(`/api/${sample.entity}`, API_BASE);
  url.searchParams.set('name', sample.name);
  url.searchParams.set('limit', '1');

  const response = await fetch(url);
  if (!response.ok) {
    failures.push(`${sample.entity}/${sample.name}: API ${response.status}`);
    continue;
  }

  const row = (await response.json()).rows?.[0];
  if (!row?.RawMD) {
    failures.push(`${sample.entity}/${sample.name}: missing RawMD`);
    continue;
  }

  const description = sample.extract(row.RawMD);
  const preview = description.replace(/\s+/g, ' ').slice(0, 120);

  console.log(`\n${sample.entity} / ${row.Name}`);
  console.log(`  description length: ${description.length}`);
  console.log(`  preview: ${preview}${description.length > 120 ? '…' : ''}`);

  if (!description || description.length < 40) {
    failures.push(`${sample.entity}/${row.Name}: description too short (${description.length})`);
  }

  if (sample.entity !== 'monsters') {
    const remainder = extractMarkdownRemainderFeatsEquipSpells(row.RawMD);
    if (description && remainder.includes(description)) {
      failures.push(`${sample.entity}/${row.Name}: remainder still contains description`);
    }
    console.log(`  remainder length: ${remainder.length}`);
  }
}

if (failures.length) {
  console.error('\nFailures:');
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

console.log('\nAll markdown extract checks passed.');
