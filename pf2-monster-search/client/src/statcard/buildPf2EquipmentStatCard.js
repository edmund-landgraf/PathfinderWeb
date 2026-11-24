import { cleanStatText, statCardRowsFromModel } from './statCardModel.js';
import { renderStatCardSvgFile } from './statCardImage.js';

function field(item, name) {
  const value = item?.[name];
  if (value == null) return '';
  return cleanStatText(value);
}

function titleCase(value) {
  return String(value ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function addRow(rows, label, value, kind = 'field') {
  const cleaned = cleanStatText(value);
  if (cleaned && cleaned !== '-') rows.push({ label, value: cleaned, kind });
}

function markdownRows(raw) {
  const lines = String(raw ?? '').replace(/\r/g, '').split('\n');
  const rows = [];
  const prose = [];
  let section = null;

  function flush() {
    if (!section) return;
    let value = cleanStatText(section.value);
    const repeated = new RegExp(`^${section.label}\\s+`, 'i');
    value = value.replace(repeated, '');
    if (value) rows.push({ label: section.label, value, kind: section.kind });
    section = null;
  }

  for (const line of lines) {
    if (/^\s*---\s*$/.test(line) || /^\s*#\s+/.test(line)) continue;
    const heading = line.match(/^\s*#{2,3}\s+(.+)$/);
    if (heading) {
      flush();
      section = { label: titleCase(cleanStatText(heading[1])), value: '', kind: 'ability' };
      continue;
    }
    const bold = line.match(/^\s*\*\*([^*]+)\*\*\s*(.*)$/);
    if (bold && !section) {
      const label = titleCase(cleanStatText(bold[1]));
      if (/^(Price|Bulk|Usage|Hands|Activate)$/i.test(label)) {
        addRow(rows, label, bold[2]);
      }
      continue;
    }
    if (section && line.trim()) section.value = `${section.value} ${line}`;
    else if (line.trim()) prose.push(line.trim());
  }
  flush();
  return { rows, prose: cleanStatText(prose.join(' ')) };
}

function equipmentModel(item) {
  const name = field(item, 'Name') || 'Item';
  const level = item?.Level ?? item?.level;
  const levelLabel = level != null && level !== '' ? `Item ${level}` : 'Item';
  const traits = [field(item, 'Rarity'), field(item, 'Traits'), field(item, 'ItemCategory'), field(item, 'ItemSubcategory')]
    .flatMap((value) => value.split(/[,;]/))
    .map((part) => titleCase(cleanStatText(part)))
    .filter((part) => part && part.toLowerCase() !== 'common');
  const rows = [];
  addRow(rows, 'Price', field(item, 'PriceText') || field(item, 'PriceCp'));
  addRow(rows, 'Bulk', field(item, 'BulkText') || field(item, 'BulkValue'));
  addRow(rows, 'Usage', field(item, 'Usage'));
  addRow(rows, 'Damage', field(item, 'Damage'));
  addRow(rows, 'AC', field(item, 'AC'));
  addRow(rows, 'Hardness', field(item, 'Hardness'));
  addRow(rows, 'HP', field(item, 'HP'));
  const seen = new Set(rows.map((row) => row.label.toLowerCase()));
  const parsed = markdownRows(item?.RawMD ?? item?.rawMD ?? item?.Summary);
  for (const row of parsed.rows) {
    if (seen.has(row.label.toLowerCase())) continue;
    seen.add(row.label.toLowerCase());
    rows.push(row);
  }
  if (!rows.some((row) => row.kind === 'ability')) {
    addRow(rows, '', parsed.prose || field(item, 'Summary'), 'ability');
  }
  return {
    name,
    creature: levelLabel,
    traits,
    rows
  };
}

export async function buildPf2EquipmentStatCardSvg(item, artFile) {
  const model = equipmentModel(item);
  return renderStatCardSvgFile({
    name: model.name,
    rows: statCardRowsFromModel(model),
    artFile,
    width: 700
  });
}
