function normalizeRawMD(rawMD) {
  return String(rawMD || '').replace(/\r\n/g, '\n').trim();
}

export function looksLikeHtmlStatBlock(rawMD) {
  return /<\s*(?:p|div|span|strong|tooltip)\b/i.test(String(rawMD || ''));
}

/** Demiplane RawMD is HTML with tooltip and action-icon spans. Cards expect markdown. */
export function htmlStatBlockToText(rawMD) {
  let html = String(rawMD || '');
  html = html.replace(/<tooltip\b[^>]*>([\s\S]*?)<\/tooltip>/gi, '$1');
  html = html.replace(/<span\b[^>]*\bthree-action[^>]*>\s*<\/span>/gi, ' ◆◆◆ ');
  html = html.replace(/<span\b[^>]*\btwo-action[^>]*>\s*<\/span>/gi, ' ◆◆ ');
  html = html.replace(/<span\b[^>]*\bone-action[^>]*>\s*<\/span>/gi, ' ◆ ');
  html = html.replace(/<span\b[^>]*\breaction[^>]*>\s*<\/span>/gi, ' ↺ ');
  html = html.replace(/<span\b[^>]*\bfree-action[^>]*>\s*<\/span>/gi, ' ◇ ');
  html = html.replace(/<br\s*\/?>/gi, '\n');
  html = html.replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n\n');
  html = html.replace(/<strong>/gi, '**').replace(/<\/strong>/gi, '**');
  html = html.replace(/<[^>]+>/g, '');
  html = html
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/g, "'");
  return html
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function isMonsterStructuredBlockStart(trimmed) {
  return (
    trimmed.startsWith('## ') ||
    trimmed === '---' ||
    trimmed.startsWith('**Source**') ||
    trimmed.startsWith('![') ||
    trimmed.startsWith('|')
  );
}

function isFeatsEquipSpellsDescriptionEnd(trimmed) {
  return trimmed === '---' || trimmed.startsWith('## ');
}

export function extractMarkdownDescriptionMonster(rawMD) {
  const normalized = normalizeRawMD(rawMD);
  if (!normalized) return '';

  const withoutTitle = normalized.replace(/^# .*(?:\n+|$)/, '').trimStart();
  const lines = withoutTitle.split('\n');
  const descriptionLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (isMonsterStructuredBlockStart(trimmed)) break;
    descriptionLines.push(line);
  }

  const description = descriptionLines.join('\n').trim();
  return description && /[a-zA-Z]/.test(description) ? description : '';
}

export function extractMarkdownRemainderMonster(rawMD) {
  const normalized = normalizeRawMD(rawMD);
  if (!normalized) return '';

  const withoutTitle = normalized.replace(/^# .*(?:\n+|$)/, '').trimStart();
  const lines = withoutTitle.split('\n');
  const structuredStart = lines.findIndex((line) => isMonsterStructuredBlockStart(line.trim()));

  if (structuredStart === -1) return '';
  return lines.slice(structuredStart).join('\n').trim();
}

export function splitFeatsEquipSpellsMarkdown(rawMD) {
  const normalized = normalizeRawMD(rawMD);
  if (!normalized) return { description: '', remainder: '' };

  const lines = normalized.split('\n');
  const firstRuleIdx = lines.findIndex((line) => line.trim() === '---');

  if (firstRuleIdx === -1) {
    return { description: '', remainder: normalized };
  }

  const headerLines = lines.slice(0, firstRuleIdx + 1);
  let index = firstRuleIdx + 1;

  while (index < lines.length && lines[index].trim() === '') {
    index += 1;
  }

  const descriptionStart = index;
  const descriptionLines = [];

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (isFeatsEquipSpellsDescriptionEnd(trimmed)) break;
    descriptionLines.push(lines[index]);
    index += 1;
  }

  while (descriptionLines.length && descriptionLines[descriptionLines.length - 1].trim() === '') {
    descriptionLines.pop();
  }

  const description = descriptionLines.join('\n').trim();
  const validDescription = description && /[a-zA-Z]/.test(description) ? description : '';

  let remainderStart = descriptionStart + descriptionLines.length;
  while (remainderStart < lines.length && lines[remainderStart].trim() === '') {
    remainderStart += 1;
  }

  const remainderParts = [...headerLines];
  if (remainderStart < lines.length) {
    remainderParts.push(...lines.slice(remainderStart));
  }

  const remainder = remainderParts.join('\n').trim();

  return {
    description: validDescription,
    remainder: validDescription ? remainder : normalized
  };
}

export function extractMarkdownDescriptionFeatsEquipSpells(rawMD) {
  return splitFeatsEquipSpellsMarkdown(rawMD).description;
}

export function extractMarkdownRemainderFeatsEquipSpells(rawMD) {
  const { description, remainder } = splitFeatsEquipSpellsMarkdown(rawMD);
  if (!description) return normalizeRawMD(rawMD);
  return remainder;
}
