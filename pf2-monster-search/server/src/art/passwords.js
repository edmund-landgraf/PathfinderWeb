import { createHmac, timingSafeEqual } from 'node:crypto';

// ART_PASSWORDS formats:
//   JSON: [{"version":3,"label":"partnerA","password":"secret"}]
//   CSV:  v3:partnerA:secret,v4::other   (label optional; password may contain ':')
// Falls back to ENABLE_ART_PWD as version 1 (label "default").
export function parseArtPasswords(raw, fallbackPassword = '') {
  const text = String(raw || '').trim();
  let entries = [];
  if (text.startsWith('[')) {
    const parsed = JSON.parse(text);
    entries = parsed.map((e) => ({
      version: String(e.version ?? '').replace(/^v/i, ''),
      label: e.label ? String(e.label) : null,
      password: String(e.password ?? '')
    }));
  } else if (text) {
    entries = text.split(',').map((part) => part.trim()).filter(Boolean).map((part) => {
      const [v, label, ...rest] = part.split(':');
      return { version: String(v || '').replace(/^v/i, ''), label: label || null, password: rest.join(':') };
    });
  } else if (fallbackPassword) {
    entries = [{ version: '1', label: 'default', password: String(fallbackPassword) }];
  }

  const seen = new Set();
  for (const entry of entries) {
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(entry.version)) throw new Error(`ART_PASSWORDS: invalid version "${entry.version}"`);
    if (!entry.password) throw new Error(`ART_PASSWORDS: version ${entry.version} has no password`);
    if (seen.has(entry.version)) throw new Error(`ART_PASSWORDS: duplicate version ${entry.version}`);
    if (entry.label && !/^[\w .-]{1,50}$/.test(entry.label)) throw new Error(`ART_PASSWORDS: invalid label for v${entry.version}`);
    seen.add(entry.version);
  }
  return entries;
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ''), 'utf8');
  const y = Buffer.from(String(b ?? ''), 'utf8');
  if (!x.length || x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

// Checks every entry (no early exit) so timing doesn't reveal which one matched.
export function matchArtPassword(entries, provided) {
  let match = null;
  for (const entry of entries) {
    if (safeEqual(provided, entry.password) && !match) match = entry;
  }
  return match ? { version: match.version, label: match.label } : null;
}

const sign = (secret, payload) => createHmac('sha256', secret).update(payload).digest('base64url');

export function signArtToken(secret, version, ttlMs, now = Date.now()) {
  const payload = `artv.${version}.${now + ttlMs}`;
  return `${payload}.${sign(secret, payload)}`;
}

// Returns { version } or null. Tokens for retired versions (not in activeVersions) are rejected.
export function verifyArtToken(secret, token, activeVersions, now = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'artv') return null;
  const [, version, exp, sig] = parts;
  if (!/^\d+$/.test(exp) || Number(exp) <= now) return null;
  if (!activeVersions.has(version)) return null;
  if (!safeEqual(sig, sign(secret, `artv.${version}.${exp}`))) return null;
  return { version };
}
