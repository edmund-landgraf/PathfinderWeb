import { sql } from './db.js';
import { MonsterImageCache } from './monsterImageCache.js';

export function detectImageContentType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return 'application/octet-stream';
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }

  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return 'image/gif';
  }

  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return 'application/octet-stream';
}

export function toNodeBuffer(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  return null;
}

const missingImageIds = new Set();
const MISSING_IMAGE_CACHE_MAX = 10000;

export function createMonsterImageCache() {
  const maxEntries = Number(process.env.MONSTER_IMAGE_CACHE_MAX || 1000);
  const maxBytes = Number(process.env.MONSTER_IMAGE_CACHE_MAX_BYTES || 128 * 1024 * 1024);
  return new MonsterImageCache({ maxEntries, maxBytes });
}

function rememberMissingImage(monsterId) {
  if (missingImageIds.size >= MISSING_IMAGE_CACHE_MAX) {
    missingImageIds.clear();
  }
  missingImageIds.add(monsterId);
}

const GENERIC_NAME_TOKENS = new Set([
  'aapoph',
  'adult',
  'ancient',
  'and',
  'creature',
  'dragon',
  'drake',
  'elemental',
  'elite',
  'from',
  'giant',
  'greater',
  'lesser',
  'monster',
  'of',
  'serpentfolk',
  'the',
  'weak',
  'wyrmling',
  'young'
]);

function distinctiveNameToken(name) {
  const words = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/[\s-]+/)
    .filter(Boolean);

  const last = words[words.length - 1];
  if (last && last.length >= 6 && !GENERIC_NAME_TOKENS.has(last)) {
    return last;
  }

  return words
    .filter((word) => word.length >= 8 && !GENERIC_NAME_TOKENS.has(word))
    .sort((a, b) => b.length - a.length)[0] || null;
}

function toMonsterIdSet(rows, key) {
  return new Set(
    (rows || [])
      .map((row) => Number(row[key]))
      .filter((id) => Number.isInteger(id) && id > 0)
  );
}

async function queryMonsterIdsWithImages(pool, ids) {
  if (!ids.length) return new Set();

  const request = pool.request();
  const placeholders = ids.map((id, index) => {
    const name = `mid${index}`;
    request.input(name, sql.Int, id);
    return `@${name}`;
  });

  const result = await request.query(`
    SELECT MonsterID
    FROM pf2.vwMonsterImagePresent
    WHERE MonsterID IN (${placeholders.join(', ')})
  `);

  return toMonsterIdSet(result.recordset, 'MonsterID');
}

async function resolveRelatedImageMonsterIds(pool, missingRows) {
  const relatedImageIds = new Map();
  const candidates = [];

  for (const row of missingRows) {
    const monsterId = Number(row.MonsterId);
    const level = Number(row.Level);
    const token = distinctiveNameToken(row.Name);
    if (!Number.isInteger(monsterId) || !Number.isInteger(level) || !token) {
      continue;
    }
    candidates.push({ monsterId, level, token });
  }

  if (!candidates.length) return relatedImageIds;

  const request = pool.request();
  const clauses = candidates.map((candidate, index) => {
    request.input(`lvl${index}`, sql.Int, candidate.level);
    request.input(`tok${index}`, sql.NVarChar(100), `%${candidate.token}%`);
    return `(m.Level = @lvl${index} AND m.Name LIKE @tok${index})`;
  });

  const siblings = await request.query(`
    SELECT m.MonsterId, m.Name, m.Level
    FROM pf2.vwMonsterHasImage m
    WHERE (${clauses.join(' OR ')})
  `);

  const siblingsByKey = new Map();
  for (const row of siblings.recordset || []) {
    const token = distinctiveNameToken(row.Name);
    if (!token) continue;
    const key = `${token}|${Number(row.Level)}`;
    const list = siblingsByKey.get(key) || [];
    list.push(Number(row.MonsterId));
    siblingsByKey.set(key, list);
  }

  for (const candidate of candidates) {
    const matches = (siblingsByKey.get(`${candidate.token}|${candidate.level}`) || [])
      .filter((id) => id !== candidate.monsterId);
    if (matches.length === 1) {
      relatedImageIds.set(candidate.monsterId, matches[0]);
    }
  }

  return relatedImageIds;
}

const IMAGE_COLUMNS = {
  MonsterImage: 'MonsterImage',
  MonsterThumbnail: 'MonsterThumbnail'
};

async function fetchMonsterImageById(pool, monsterId, column = IMAGE_COLUMNS.MonsterImage) {
  const imageColumn = IMAGE_COLUMNS[column] || IMAGE_COLUMNS.MonsterImage;
  const result = await pool.request()
    .input('monsterId', sql.Int, monsterId)
    .query(`
      SELECT ${imageColumn}
      FROM pf2.MonsterImage
      WHERE MonsterID = @monsterId
        AND ${imageColumn} IS NOT NULL
    `);

  const imageBuffer = toNodeBuffer(result.recordset?.[0]?.[imageColumn]);
  if (!imageBuffer?.length) {
    return null;
  }

  return {
    buffer: imageBuffer,
    contentType: detectImageContentType(imageBuffer),
    byteLength: imageBuffer.length
  };
}

async function resolveRelatedMonsterImageId(pool, monsterId) {
  const identity = await pool.request()
    .input('monsterId', sql.Int, monsterId)
    .query(`
      SELECT MonsterId, Name, Level
      FROM pf2.Monster
      WHERE MonsterId = @monsterId
    `);
  const relatedIds = await resolveRelatedImageMonsterIds(pool, identity.recordset || []);
  const relatedId = relatedIds.get(monsterId);
  if (!relatedId || relatedId === monsterId) {
    return null;
  }
  return relatedId;
}

export async function fetchMonsterImageFromDb(pool, monsterId) {
  const image = await fetchMonsterImageById(pool, monsterId, IMAGE_COLUMNS.MonsterImage);
  if (image) {
    return image;
  }

  try {
    const relatedId = await resolveRelatedMonsterImageId(pool, monsterId);
    if (!relatedId) {
      return null;
    }

    return fetchMonsterImageById(pool, relatedId, IMAGE_COLUMNS.MonsterImage);
  } catch (err) {
    console.warn('Related monster image fetch failed:', err.message);
    return null;
  }
}

async function fetchMonsterThumbnailFromDb(pool, monsterId) {
  const thumbnail = await fetchMonsterImageById(pool, monsterId, IMAGE_COLUMNS.MonsterThumbnail);
  if (thumbnail) {
    return thumbnail;
  }

  try {
    const relatedId = await resolveRelatedMonsterImageId(pool, monsterId);
    if (!relatedId) {
      return null;
    }

    return fetchMonsterImageById(pool, relatedId, IMAGE_COLUMNS.MonsterThumbnail);
  } catch (err) {
    console.warn('Related monster thumbnail fetch failed:', err.message);
    return null;
  }
}

export async function getCachedMonsterThumbnail(pool, cache, monsterId) {
  if (missingImageIds.has(monsterId)) {
    return null;
  }

  const cached = cache.get(monsterId);
  if (cached) {
    return { ...cached, cacheHit: true };
  }

  const image = await fetchMonsterThumbnailFromDb(pool, monsterId);
  if (!image) {
    rememberMissingImage(monsterId);
    return null;
  }

  const entry = {
    buffer: image.buffer,
    contentType: image.contentType,
    byteLength: image.byteLength,
    cachedAt: Date.now()
  };

  cache.set(monsterId, entry);
  return { ...entry, cacheHit: false };
}

export function sendMonsterImageResponse(res, image, { cacheControl }) {
  res.setHeader('Content-Type', image.contentType);
  res.setHeader('Content-Length', String(image.byteLength));
  res.setHeader('Cache-Control', cacheControl);
  res.end(image.buffer);
}

export async function attachMonsterImageUrls(pool, rows) {
  for (const row of rows) {
    if ('ImageUrl' in row && row.ContentType !== 'user generated') {
      row.ImageUrl = null;
    }
  }

  if (!rows.length) return rows;

  const ids = [...new Set(
    rows
      .filter((row) => row.ContentType !== 'user generated')
      .map((row) => Number(row.MonsterId))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];

  if (!ids.length) return rows;

  const hasImage = await queryMonsterIdsWithImages(pool, ids);
  const missingRows = rows.filter((row) => !hasImage.has(Number(row.MonsterId)));
  let relatedImageIds = new Map();
  try {
    relatedImageIds = await resolveRelatedImageMonsterIds(pool, missingRows);
  } catch (err) {
    console.warn('Related monster image lookup failed:', err.message);
  }

  for (const row of rows) {
    const monsterId = Number(row.MonsterId);
    if (hasImage.has(monsterId) || relatedImageIds.has(monsterId)) {
      row.ImageUrl = `/api/monsters/${monsterId}/image/thumb`;
    }
  }

  return rows;
}
