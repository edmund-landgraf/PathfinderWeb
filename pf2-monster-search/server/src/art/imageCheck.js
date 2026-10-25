import sharp from 'sharp';

export const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// Magic-byte sniff only; declared MIME / extension are ignored.
export function sniffImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.subarray(1, 8).toString('latin1') === 'PNG\r\n\x1a\n') return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

function fail(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

export function decodeUploadBody(body, maxBytes) {
  const raw = String(body?.imageBase64 ?? body?.imageDataUrl ?? '').trim();
  if (!raw) throw fail('Image is required.');
  const m = raw.match(/^data:[^;,]*;base64,(.+)$/is);
  const b64 = (m ? m[1] : raw).replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+=*$/.test(b64)) throw fail('Image must be base64.');
  if (Math.floor(b64.length * 3 / 4) > maxBytes + 3) throw fail(`Image must be at most ${Math.round(maxBytes / 1048576)} MB.`, 413);
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length || buf.length > maxBytes) throw fail(`Image must be a non-empty file up to ${Math.round(maxBytes / 1048576)} MB.`, 413);
  return buf;
}

const INPUT_MAX_EDGE = 16000;

async function renderImage(buf, opts, { edge, format, quality }) {
  let pipeline = sharp(buf, opts).rotate();
  if (edge) {
    pipeline = pipeline.resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true });
  }
  if (format === 'png') pipeline = pipeline.png({ compressionLevel: 9 });
  else if (format === 'jpeg') pipeline = pipeline.jpeg({ quality, mozjpeg: true });
  else pipeline = pipeline.webp({ quality });
  return pipeline.toBuffer({ resolveWithObject: true });
}

// Accepts a large original, then resizes and re-encodes until it fits maxBytes.
// Drops EXIF/ICC/XMP and anything appended to the file.
export async function sanitizeImage(buf, { maxBytes, maxDimension, intakeBytes }) {
  const intake = intakeBytes || Math.max(maxBytes, 40 * 1024 * 1024);
  if (buf.length > intake) throw fail('Image is too large to accept.', 413);
  const type = sniffImageType(buf);
  if (!type) throw fail('Image must be PNG, JPEG, or WebP (SVG and GIF are not accepted).', 415);

  const opts = { failOn: 'error', limitInputPixels: INPUT_MAX_EDGE * INPUT_MAX_EDGE };
  let meta;
  try {
    meta = await sharp(buf, opts).metadata();
  } catch {
    throw fail('Image could not be decoded.', 415);
  }
  const fmt = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[meta.format];
  if (fmt !== type) throw fail('Image content does not match its format.', 415);
  if (!meta.width || !meta.height) throw fail('Image could not be decoded.', 415);
  if (meta.width > INPUT_MAX_EDGE || meta.height > INPUT_MAX_EDGE) {
    throw fail(`Image dimensions must be at most ${INPUT_MAX_EDGE}px on a side.`, 413);
  }

  const native = { png: 'png', jpeg: 'jpeg', webp: 'webp' }[meta.format];
  const longest = Math.max(meta.width, meta.height);
  const fitEdge = Math.min(maxDimension, longest);
  let out;
  try {
    out = await renderImage(buf, opts, { edge: fitEdge, format: native, quality: 88 });
  } catch {
    throw fail('Image could not be re-encoded.', 415);
  }
  if (out.data.length <= maxBytes) {
    return { buffer: out.data, contentType: type, width: out.info.width, height: out.info.height };
  }

  const edges = [...new Set([fitEdge, 2048, 1600, 1200, 800].filter((edge) => edge <= fitEdge && edge > 0))];
  try {
    for (const edge of edges) {
      for (const format of ['webp', 'jpeg']) {
        for (const quality of [82, 70, 58, 45]) {
          out = await renderImage(buf, opts, { edge, format, quality });
          if (out.data.length <= maxBytes) {
            const contentType = format === 'jpeg' ? 'image/jpeg' : 'image/webp';
            return { buffer: out.data, contentType, width: out.info.width, height: out.info.height };
          }
        }
      }
    }
  } catch {
    throw fail('Image could not be re-encoded.', 415);
  }
  throw fail('Image could not be compressed under the size limit.', 413);
}
