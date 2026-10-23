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

// Validates and re-encodes (drops EXIF/ICC/XMP and anything appended to the file).
export async function sanitizeImage(buf, { maxBytes, maxDimension }) {
  if (buf.length > maxBytes) throw fail('Image too large.', 413);
  const type = sniffImageType(buf);
  if (!type) throw fail('Image must be PNG, JPEG, or WebP (SVG and GIF are not accepted).', 415);

  const opts = { failOn: 'error', limitInputPixels: maxDimension * maxDimension };
  let meta;
  try {
    meta = await sharp(buf, opts).metadata();
  } catch {
    throw fail('Image could not be decoded.', 415);
  }
  const fmt = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[meta.format];
  if (fmt !== type) throw fail('Image content does not match its format.', 415);
  if (!meta.width || !meta.height || meta.width > maxDimension || meta.height > maxDimension) {
    throw fail(`Image dimensions must be at most ${maxDimension}x${maxDimension}px.`, 413);
  }

  let pipeline = sharp(buf, opts).rotate(); // apply EXIF orientation, then metadata is dropped
  if (type === 'image/png') pipeline = pipeline.png({ compressionLevel: 9 });
  else if (type === 'image/jpeg') pipeline = pipeline.jpeg({ quality: 88, mozjpeg: true });
  else pipeline = pipeline.webp({ quality: 88 });

  let out;
  try {
    out = await pipeline.toBuffer({ resolveWithObject: true });
  } catch {
    throw fail('Image could not be re-encoded.', 415);
  }
  return { buffer: out.data, contentType: type, width: out.info.width, height: out.info.height };
}
