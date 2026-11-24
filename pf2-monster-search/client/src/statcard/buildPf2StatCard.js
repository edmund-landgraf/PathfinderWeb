import { apiStatCardModel, rawMdStatCardModel, statCardRowsFromModel } from './statCardModel.js';
import { renderStatCardSvgFile } from './statCardImage.js';

function withCreatureHeading(monster) {
  const raw = String(monster.RawMD || monster.rawMD || '')
    .replace(/\r\n/g, '\n')
    .replace(/_([^_\n]+)_/g, '$1');
  if (/\bCreature\s+[-+]?\d+\b/i.test(raw)) return raw;
  const name = monster.Name || monster.name || 'Creature';
  const level = monster.Level ?? monster.level ?? '?';
  let body = raw.replace(/^#\s+.*(?:\n+|$)/, '');
  const traits = [];
  body = body.replace(/^\*\*Traits\*\*\s*(.+)$/im, (_, list) => {
    String(list).split(/[,;]/).forEach((part) => {
      const trait = part.replace(/\*/g, '').trim();
      if (trait) traits.push(`- ${trait}`);
    });
    return '';
  });
  return `## ${name} Creature ${level}\n\n${traits.join('\n')}\n\n${body}`.trim();
}

function cardModel(monster) {
  const prepared = { ...monster, RawMD: withCreatureHeading(monster) };
  const model = apiStatCardModel(prepared);
  const raw = rawMdStatCardModel(prepared.RawMD, prepared.Name || prepared.name);
  const traits = [...new Set([...(raw.traits || []), ...(model.traits || [])])]
    .filter((trait) => trait.toLowerCase() !== 'common');
  return {
    ...model,
    name: model.name || prepared.Name || 'Creature',
    creature: model.creature || (prepared.Level != null ? `Creature ${prepared.Level}` : ''),
    traits
  };
}

export async function buildPf2StatCardSvg(monster, artFile) {
  const model = cardModel(monster);
  return renderStatCardSvgFile({
    name: model.name,
    rows: statCardRowsFromModel(model),
    artFile,
    width: 700
  });
}
