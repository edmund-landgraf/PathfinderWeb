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

// Item description markup. A title line is ignored. **Label** value lines are fields.
// Item and Traits set the card header. A blank line ends a field. The rest is the body.
//
// **Item** 2
// **Traits** Uncommon, Fire, Magical, Invested
// **Price** 30 gp
// **Bulk** L
// **Usage** worn
// **Activate** [one-action] (concentrate); Frequency once per day; Effect ...
//
// A blackened copper pendant...
const MARKUP_FIELDS = /^(Item|Traits|Price|Bulk|Usage|Hands|Activate|Damage|AC|Hardness|HP)$/i;

function parseItemMarkup(raw) {
  const lines = String(raw ?? '').replace(/\r/g, '').split('\n');
  const fields = {};
  const prose = [];
  let open = null;

  function close() {
    if (!open) return;
    const value = cleanStatText(open.value);
    if (value) fields[open.label.toLowerCase()] = value;
    open = null;
  }

  for (const line of lines) {
    if (/^\s*---\s*$/.test(line) || /^\s*#\s+/.test(line)) continue;
    if (!line.trim()) {
      close();
      continue;
    }
    const bold = line.match(/^\s*\*\*([^*]+)\*\*\s*(.*)$/);
    if (bold && MARKUP_FIELDS.test(bold[1].trim())) {
      close();
      open = { label: bold[1].trim(), value: bold[2] || '' };
      continue;
    }
    if (open) open.value = `${open.value} ${line.trim()}`;
    else prose.push(line.trim());
  }
  close();
  return { fields, prose: cleanStatText(prose.join(' ')) };
}

function traitList(value) {
  return String(value ?? '')
    .split(/[,;]/)
    .map((part) => titleCase(cleanStatText(part)))
    .filter((part) => part && part.toLowerCase() !== 'common');
}

function equipmentModel(item) {
  const name = field(item, 'Name') || 'Item';
  const markup = parseItemMarkup(item?.RawMD ?? item?.rawMD ?? item?.Description ?? item?.Summary);
  const level = markup.fields.item ?? item?.Level ?? item?.level;
  const levelLabel = level != null && String(level).trim() !== ''
    ? (/^item\b/i.test(String(level)) ? titleCase(level) : `Item ${level}`)
    : 'Item';
  const traits = markup.fields.traits
    ? traitList(markup.fields.traits)
    : traitList([field(item, 'Rarity'), field(item, 'Traits'), field(item, 'ItemCategory'), field(item, 'ItemSubcategory')].filter(Boolean).join(', '));
  const rows = [];
  addRow(rows, 'Price', markup.fields.price || field(item, 'PriceText') || field(item, 'PriceCp'));
  addRow(rows, 'Bulk', markup.fields.bulk || field(item, 'BulkText') || field(item, 'BulkValue'));
  addRow(rows, 'Usage', markup.fields.usage || field(item, 'Usage'));
  addRow(rows, 'Hands', markup.fields.hands);
  addRow(rows, 'Activate', markup.fields.activate);
  addRow(rows, 'Damage', markup.fields.damage || field(item, 'Damage'));
  addRow(rows, 'AC', markup.fields.ac || field(item, 'AC'));
  addRow(rows, 'Hardness', markup.fields.hardness || field(item, 'Hardness'));
  addRow(rows, 'HP', markup.fields.hp || field(item, 'HP'));
  addRow(rows, '', markup.prose, 'ability');
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
