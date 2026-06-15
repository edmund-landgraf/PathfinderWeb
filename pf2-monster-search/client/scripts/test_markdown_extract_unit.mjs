import {
  extractMarkdownDescriptionMonster,
  extractMarkdownDescriptionFeatsEquipSpells,
  extractMarkdownRemainderFeatsEquipSpells
} from '../src/markdownExtract.js';

const featMD = `# 
[Yamaraj's Grandeur](/Feats.aspx?ID=2366) Two Actions
 Feat 17

- Duskwalker

**Source** [Ancestry Guide](/Sources.aspx?ID=74) pg. 31

**Frequency**
once per day

---

You have been granted a sliver of the power of the yamaraj. You exhale a blast of icy wind and ravenous insects.`;

const spellMD = `# 
[Fireball](/Spells.aspx?ID=119)
Two Actions
 Spell 3

- Evocation

**Source** [Core Rulebook](/Sources.aspx?ID=1) pg. 338

---

A roaring blast of fire appears at a spot you designate, dealing 6d6 fire damage.

---
**Heightened (+1)** The damage increases by 2d6.`;

const monsterMD = `# [Abrikandilu (Wrecker Demon)](/Monsters.aspx?ID=499)

Wrecker demons, also known as abrikandilus, despise beautiful things.

**[Recall Knowledge - Fiend](/Rules.aspx?ID=563)**
`;

const failures = [];

const featDescription = extractMarkdownDescriptionFeatsEquipSpells(featMD);
if (!featDescription.includes('You have been granted')) {
  failures.push('feat description missing prose');
}

const featRemainder = extractMarkdownRemainderFeatsEquipSpells(featMD);
if (featRemainder.includes('You have been granted')) {
  failures.push('feat remainder still contains description');
}
if (!featRemainder.includes('**Source**')) {
  failures.push('feat remainder missing metadata');
}

const spellDescription = extractMarkdownDescriptionFeatsEquipSpells(spellMD);
if (!spellDescription.includes('roaring blast of fire')) {
  failures.push('spell description missing prose');
}

const spellRemainder = extractMarkdownRemainderFeatsEquipSpells(spellMD);
if (!spellRemainder.includes('Heightened (+1)')) {
  failures.push('spell remainder missing heightened block');
}
if (spellRemainder.includes('roaring blast of fire')) {
  failures.push('spell remainder still contains description');
}

const monsterDescription = extractMarkdownDescriptionMonster(monsterMD);
if (!monsterDescription.includes('Wrecker demons')) {
  failures.push('monster description missing prose');
}

if (failures.length) {
  console.error('Unit test failures:');
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

console.log('markdownExtract unit tests passed.');
