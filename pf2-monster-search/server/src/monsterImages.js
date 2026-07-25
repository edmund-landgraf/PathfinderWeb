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

export function createMonsterImageCache() {
  const maxEntries = Number(process.env.MONSTER_IMAGE_CACHE_MAX || 1000);
  return new MonsterImageCache({ maxEntries });
}

export async function fetchMonsterImageFromDb(pool, monsterId) {
  const result = await pool.request()
    .input('monsterId', sql.Int, monsterId)
    .query(`
      SELECT MonsterImage
      FROM pf2.MonsterImage
      WHERE MonsterID = @monsterId
        AND MonsterImage IS NOT NULL
    `);

  const imageBuffer = toNodeBuffer(result.recordset?.[0]?.MonsterImage);
  if (!imageBuffer?.length) {
    return null;
  }

  return {
    buffer: imageBuffer,
    contentType: detectImageContentType(imageBuffer),
    byteLength: imageBuffer.length
  };
}

export async function getCachedMonsterThumbnail(pool, cache, monsterId) {
  const cached = cache.get(monsterId);
  if (cached) {
    return { ...cached, cacheHit: true };
  }

  const image = await fetchMonsterImageFromDb(pool, monsterId);
  if (!image) {
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
    if ('ImageUrl' in row) {
      row.ImageUrl = null;
    }
  }

  if (!rows.length) return rows;

  const ids = [...new Set(
    rows
      .map((row) => Number(row.MonsterId))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];

  if (!ids.length) return rows;

  const request = pool.request();
  const placeholders = ids.map((id, index) => {
    const name = `mid${index}`;
    request.input(name, sql.Int, id);
    return `@${name}`;
  });

  const result = await request.query(`
    SELECT MonsterID
    FROM pf2.MonsterImage
    WHERE MonsterID IN (${placeholders.join(', ')})
      AND MonsterImage IS NOT NULL
  `);

  const hasImage = new Set((result.recordset || []).map((row) => row.MonsterID));
  for (const row of rows) {
    if (hasImage.has(row.MonsterId)) {
      row.ImageUrl = `/api/monsters/${row.MonsterId}/image/thumb`;
    }
  }

  return rows;
}
