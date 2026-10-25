import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { parseArtPasswords, matchArtPassword, signArtToken, verifyArtToken } from '../src/art/passwords.js';
import { createRateLimiter } from '../src/art/rateLimit.js';
import { sniffImageType, sanitizeImage, decodeUploadBody } from '../src/art/imageCheck.js';

const LIMITS = { maxBytes: 5 * 1024 * 1024, maxDimension: 4096 };

test('parses CSV and JSON art passwords', () => {
  assert.deepEqual(parseArtPasswords('v3:partnerA:se:cret,4::x'), [
    { version: '3', label: 'partnerA', password: 'se:cret' },
    { version: '4', label: null, password: 'x' }
  ]);
  assert.equal(parseArtPasswords('[{"version":"v2","label":"b","password":"p"}]')[0].version, '2');
  assert.deepEqual(parseArtPasswords('', 'old'), [{ version: '1', label: 'default', password: 'old' }]);
  assert.throws(() => parseArtPasswords('v1:a:x,v1:b:y'), /duplicate/);
});

test('matches password to version', () => {
  const e = parseArtPasswords('v3:a:alpha,v4:b:beta');
  assert.deepEqual(matchArtPassword(e, 'beta'), { version: '4', label: 'b' });
  assert.equal(matchArtPassword(e, 'nope'), null);
  assert.equal(matchArtPassword(e, ''), null);
});

test('art token: valid, retired, expired, tampered', () => {
  const t = signArtToken('s', '3', 1000, 0);
  assert.deepEqual(verifyArtToken('s', t, new Set(['3']), 10), { version: '3' });
  assert.equal(verifyArtToken('s', t, new Set(['4']), 10), null, 'retired version');
  assert.equal(verifyArtToken('s', t, new Set(['3']), 5000), null, 'expired');
  assert.equal(verifyArtToken('other', t, new Set(['3']), 10), null, 'wrong secret');
  assert.equal(verifyArtToken('s', t.replace('artv.3', 'artv.4'), new Set(['3', '4']), 10), null, 'tampered');
  assert.equal(verifyArtToken('s', 'art.123.sig', new Set(['3']), 10), null, 'legacy token');
});

test('rate limiter', () => {
  const rl = createRateLimiter({ limit: 2, windowMs: 1000 });
  assert.ok(rl.take('k', 0).ok);
  assert.ok(rl.take('k', 1).ok);
  assert.equal(rl.take('k', 2).ok, false);
  assert.ok(rl.take('k', 1001).ok);
});

const png = () => sharp({ create: { width: 20, height: 10, channels: 3, background: '#f00' } }).png().toBuffer();

test('accepts PNG/JPEG/WebP by magic bytes and re-encodes without EXIF', async () => {
  const jpg = await sharp(await png()).jpeg().withMetadata({ exif: { IFD0: { Copyright: 'secret' } } }).toBuffer();
  assert.ok((await sharp(jpg).metadata()).exif);
  const out = await sanitizeImage(jpg, LIMITS);
  assert.equal(out.contentType, 'image/jpeg');
  assert.equal((await sharp(out.buffer).metadata()).exif, undefined);
  assert.equal((await sanitizeImage(await png(), LIMITS)).contentType, 'image/png');
  const webp = await sharp(await png()).webp().toBuffer();
  assert.equal(sniffImageType(webp), 'image/webp');
  assert.equal((await sanitizeImage(webp, LIMITS)).width, 20);
});

test('rejects SVG, GIF, HTML, junk after PNG header, oversize dims and bytes', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  await assert.rejects(sanitizeImage(svg, LIMITS), /PNG, JPEG, or WebP/);
  const gif = await sharp(await png()).gif().toBuffer();
  await assert.rejects(sanitizeImage(gif, LIMITS), /PNG, JPEG, or WebP/);
  const fake = Buffer.concat([(await png()).subarray(0, 8), Buffer.alloc(64, 1)]);
  await assert.rejects(sanitizeImage(fake, LIMITS), /decoded|re-encoded/);
  const big = await sharp({ create: { width: 50, height: 10, channels: 3, background: '#000' } }).png().toBuffer();
  const fitted = await sanitizeImage(big, { maxBytes: LIMITS.maxBytes, maxDimension: 40 });
  assert.equal(fitted.width, 40);
  assert.ok(fitted.height <= 40);
  assert.throws(() => decodeUploadBody({ imageBase64: Buffer.alloc(2000).toString('base64') }, 1000), /at most/);
  assert.throws(() => decodeUploadBody({}, 1000), /required/);
});

test('compresses a bulky image under maxBytes', async () => {
  const raw = Buffer.alloc(480 * 480 * 3);
  for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 17) & 255;
  const noisy = await sharp(raw, { raw: { width: 480, height: 480, channels: 3 } }).png().toBuffer();
  const out = await sanitizeImage(noisy, { maxBytes: 20 * 1024, maxDimension: 4096, intakeBytes: 8 * 1024 * 1024 });
  assert.ok(out.buffer.length <= 20 * 1024);
  assert.ok(out.width <= 480 && out.height <= 480);
});

test('decodeUploadBody ignores declared MIME', async () => {
  const b = await png();
  const buf = decodeUploadBody({ imageDataUrl: `data:image/svg+xml;base64,${b.toString('base64')}` }, LIMITS.maxBytes);
  assert.equal(sniffImageType(buf), 'image/png');
});
