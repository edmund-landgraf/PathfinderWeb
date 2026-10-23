import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const ART_COOKIE = 'pf2_art';
export const ADMIN_COOKIE = 'pf2_admin';
export const UNLOCK_TTL_MS = 12 * 60 * 60 * 1000;

export const ADMIN_UNLOCK_SECRET_ENV = 'ADMIN_UNLOCK_SECRET';
export const ADMIN_COOKIE_SECRET_ENV = 'ADMIN_COOKIE_SECRET';
export const MIN_ADMIN_SECRET_LENGTH = 16;

export const ADMIN_MAX_FAILURES = 5;
export const ADMIN_LOCKOUT_MS = 15 * 60 * 1000;
export const ART_MAX_FAILURES = 30;
export const ART_LOCKOUT_MS = 2 * 60 * 1000;

export const DEFAULT_PAGE_LIMIT = 100;
export const MAX_PAGE_LIMIT = 500;

const HEAVY_RESPONSE_FIELDS = ['RawHtml', 'RawText', 'RawMD', 'RawJson'];

export function digestEqual(provided, expected) {
  const left = createHash('sha256').update(String(provided ?? ''), 'utf8').digest();
  const right = createHash('sha256').update(String(expected ?? ''), 'utf8').digest();
  return timingSafeEqual(left, right);
}

export function passwordMatches(provided, expected) {
  if (typeof expected !== 'string' || expected.length === 0) return false;
  return digestEqual(provided, expected);
}

function readEnv(name) {
  return String(process.env[name] ?? '');
}

export function isStrongSecret(value) {
  return typeof value === 'string' && value.trim().length >= MIN_ADMIN_SECRET_LENGTH;
}

export function adminUnlockSecret() {
  const value = readEnv(ADMIN_UNLOCK_SECRET_ENV).trim();
  return isStrongSecret(value) ? value : '';
}

export function adminCookieSecret() {
  const value = readEnv(ADMIN_COOKIE_SECRET_ENV).trim();
  return isStrongSecret(value) ? value : '';
}

export function adminUnlockConfigured() {
  return Boolean(adminUnlockSecret() && adminCookieSecret());
}

export function artPassword() {
  return readEnv('ENABLE_ART_PWD');
}

export function artCookieSecret() {
  const dedicated = readEnv('ART_COOKIE_SECRET').trim();
  if (dedicated) return `art-cookie:${dedicated}`;
  const password = artPassword();
  if (!password) return '';
  return `art-cookie-v1:${password}`;
}

export function artGloballyEnabled() {
  return readEnv('ENABLE_ART').toLowerCase() === 'true' || readEnv('ENABLE_ART') === '';
}

export function signUnlock(kind, secret, now = Date.now(), ttlMs = UNLOCK_TTL_MS) {
  if (!secret) throw new Error('Cannot sign an unlock token without a key.');
  const exp = now + ttlMs;
  const payload = `${kind}.${exp}`;
  const sig = createHmac('sha256', secret).update(`v1.${payload}`).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyUnlock(token, kind, secret, now = Date.now()) {
  if (!secret || !kind) return false;

  const value = String(token || '');
  const splitAt = value.lastIndexOf('.');
  const expAt = value.indexOf('.');
  if (expAt <= 0 || splitAt <= expAt) return false;

  const tokenKind = value.slice(0, expAt);
  const exp = value.slice(expAt + 1, splitAt);
  const sig = value.slice(splitAt + 1);
  if (tokenKind !== kind || !/^\d+$/.test(exp) || !sig) return false;
  if (Number(exp) <= now) return false;

  const payload = `${tokenKind}.${exp}`;
  const expected = createHmac('sha256', secret).update(`v1.${payload}`).digest('base64url');
  const actual = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (actual.length !== expectedBuf.length) return false;
  return timingSafeEqual(actual, expectedBuf);
}

export function createAttemptLimiter({ maxFailures, lockoutMs, maxBuckets = 10000 }) {
  const buckets = new Map();

  function prune(now) {
    if (buckets.size < maxBuckets) return;
    for (const [key, bucket] of buckets) {
      if (!bucket.lockedUntil || bucket.lockedUntil <= now) buckets.delete(key);
      if (buckets.size < maxBuckets / 2) break;
    }
  }

  return {
    check(ip, now = Date.now()) {
      const bucket = buckets.get(ip);
      if (!bucket?.lockedUntil || bucket.lockedUntil <= now) {
        if (bucket?.lockedUntil && bucket.lockedUntil <= now) buckets.delete(ip);
        return { allowed: true, retryAfterSec: 0 };
      }
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((bucket.lockedUntil - now) / 1000))
      };
    },
    fail(ip, now = Date.now()) {
      prune(now);
      let bucket = buckets.get(ip);
      if (!bucket || (bucket.lockedUntil && bucket.lockedUntil <= now)) {
        bucket = { failures: 0, lockedUntil: 0 };
      }
      bucket.failures += 1;
      let locked = false;
      let retryAfterSec = 0;
      if (bucket.failures >= maxFailures) {
        bucket.lockedUntil = now + lockoutMs;
        bucket.failures = 0;
        locked = true;
        retryAfterSec = Math.max(1, Math.ceil(lockoutMs / 1000));
      }
      buckets.set(ip, bucket);
      return { failures: bucket.failures, locked, retryAfterSec };
    },
    succeed(ip) {
      buckets.delete(ip);
    },
    clear() {
      buckets.clear();
    }
  };
}

export const adminAttemptLimiter = createAttemptLimiter({
  maxFailures: ADMIN_MAX_FAILURES,
  lockoutMs: ADMIN_LOCKOUT_MS
});

export const artAttemptLimiter = createAttemptLimiter({
  maxFailures: ART_MAX_FAILURES,
  lockoutMs: ART_LOCKOUT_MS
});

export function clientIp(req) {
  const ip = req?.ip || req?.socket?.remoteAddress || '';
  return ip || 'unknown';
}

export function trustProxySetting(raw = process.env.TRUST_PROXY_HOPS) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return 1;
  const value = String(raw).trim().toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  const hops = Number(value);
  if (Number.isInteger(hops) && hops >= 0) return hops;
  return 1;
}

export function debugSqlEnabled() {
  return readEnv('DEBUG_SQL').toLowerCase() === 'true';
}

export function parsePage(query, { fallbackLimit = DEFAULT_PAGE_LIMIT, maxLimit = MAX_PAGE_LIMIT } = {}) {
  const limit = parseBoundedInt(query?.limit, fallbackLimit, 1, maxLimit);
  const offset = parseBoundedInt(query?.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  return { limit, offset };
}

function parseBoundedInt(value, fallback, min, max) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

export function searchPayload(payload, debug) {
  if (!debugSqlEnabled()) return payload;
  return { ...payload, debug };
}

export function omitHeavyFields(row) {
  if (!row || typeof row !== 'object') return row;
  const copy = { ...row };
  for (const field of HEAVY_RESPONSE_FIELDS) delete copy[field];
  return copy;
}

export function hideArtUrls(rows) {
  for (const row of rows || []) {
    if (row && 'ImageUrl' in row) row.ImageUrl = null;
  }
  return rows;
}
