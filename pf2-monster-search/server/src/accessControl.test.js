import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import {
  ADMIN_COOKIE,
  ART_COOKIE,
  adminAttemptLimiter,
  artAttemptLimiter,
  createAttemptLimiter,
  debugSqlEnabled,
  digestEqual,
  parsePage,
  passwordMatches,
  searchPayload,
  signUnlock,
  verifyUnlock
} from './accessControl.js';

const ADMIN_PASSWORD = 'test-admin-secret-value';
const ADMIN_COOKIE_KEY = 'test-admin-cookie-secret';
const ART_PASSWORD = 'art-ok';

process.env.ADMIN_UNLOCK_SECRET = ADMIN_PASSWORD;
process.env.ADMIN_COOKIE_SECRET = ADMIN_COOKIE_KEY;
process.env.ENABLE_ART = 'false';
process.env.ENABLE_ART_PWD = ART_PASSWORD;
process.env.DEBUG_SQL = '';
process.env.TRUST_PROXY_HOPS = '1';
process.env.SQL_TRUSTED_CONNECTION = 'false';
process.env.SQL_USER = 'unused';
process.env.SQL_PASSWORD = 'unused';
process.env.SQL_SERVER = '127.0.0.1';
process.env.SQL_CONNECTION_TIMEOUT_MS = '1500';
delete process.env.ART_COOKIE_SECRET;

const { app } = await import('./server.js');

function cookieHeader(setCookie, name) {
  const list = Array.isArray(setCookie) ? setCookie : [setCookie].filter(Boolean);
  const line = list.find((item) => String(item).startsWith(`${name}=`));
  if (!line) return '';
  return line.split(';')[0];
}

async function request(port, path, { method = 'GET', ip = '203.0.113.10', body, cookie } = {}) {
  const headers = { 'x-forwarded-for': ip };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let json = null;
  if (text) json = JSON.parse(text);
  return { response, text, json };
}

test('digest compare accepts equal secrets and rejects different lengths without throwing', () => {
  assert.equal(digestEqual('same-password', 'same-password'), true);
  assert.equal(digestEqual('short', 'much-longer-secret-value'), false);
  assert.equal(passwordMatches('', ''), false);
  assert.equal(passwordMatches('anything', ''), false);
});

test('unlock tokens are kind- and key-separated', () => {
  const artKey = `art-cookie-v1:${ART_PASSWORD}`;
  const artToken = signUnlock('art', artKey);
  const adminToken = signUnlock('admin', ADMIN_COOKIE_KEY);

  assert.equal(verifyUnlock(artToken, 'art', artKey), true);
  assert.equal(verifyUnlock(artToken, 'admin', artKey), false);
  assert.equal(verifyUnlock(artToken, 'admin', ADMIN_COOKIE_KEY), false);
  assert.equal(verifyUnlock(adminToken, 'admin', ADMIN_COOKIE_KEY), true);
  assert.equal(verifyUnlock(adminToken, 'art', ADMIN_COOKIE_KEY), false);
  assert.equal(verifyUnlock(adminToken, 'admin', artKey), false);
  assert.equal(verifyUnlock(artToken, 'art', ADMIN_COOKIE_KEY), false);
});

test('attempt limiter locks out after the configured failures', () => {
  const limiter = createAttemptLimiter({ maxFailures: 5, lockoutMs: 15 * 60 * 1000 });
  const now = 1_000_000;
  for (let i = 1; i <= 4; i += 1) {
    const result = limiter.fail('198.51.100.2', now);
    assert.equal(result.locked, false);
    assert.equal(limiter.check('198.51.100.2', now).allowed, true);
  }
  const locked = limiter.fail('198.51.100.2', now);
  assert.equal(locked.locked, true);
  assert.equal(locked.retryAfterSec, 15 * 60);
  assert.equal(limiter.check('198.51.100.2', now + 1000).allowed, false);
  assert.equal(limiter.check('198.51.100.2', now + 15 * 60 * 1000).allowed, true);
  assert.equal(limiter.check('198.51.100.3', now).allowed, true);
});

test('page parser keeps the existing default and max', () => {
  assert.deepEqual(parsePage({}), { limit: 100, offset: 0 });
  assert.deepEqual(parsePage({ limit: '', offset: '' }), { limit: 100, offset: 0 });
  assert.deepEqual(parsePage({ limit: '10.9', offset: '-4' }), { limit: 10, offset: 0 });
  assert.deepEqual(parsePage({ limit: '9999', offset: '25' }), { limit: 500, offset: 25 });
  assert.deepEqual(parsePage({ limit: 'nope' }), { limit: 100, offset: 0 });
});

test('search payloads omit SQL debug unless DEBUG_SQL=true', () => {
  const previous = process.env.DEBUG_SQL;
  try {
    delete process.env.DEBUG_SQL;
    assert.equal(debugSqlEnabled(), false);
    assert.deepEqual(searchPayload({ rows: [] }, { where: ['secret'] }), { rows: [] });
    process.env.DEBUG_SQL = 'true';
    assert.deepEqual(searchPayload({ rows: [] }, { where: ['Name LIKE @name'] }), {
      rows: [],
      debug: { where: ['Name LIKE @name'] }
    });
  } finally {
    if (previous === undefined) delete process.env.DEBUG_SQL;
    else process.env.DEBUG_SQL = previous;
  }
});

test('unlock routes, cookies, and custom-content writes', async (t) => {
  adminAttemptLimiter.clear();
  artAttemptLimiter.clear();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  t.after(() => new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  }));

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(' '));
  t.after(() => {
    console.warn = originalWarn;
  });

  const artUnlock = await request(port, '/api/art/unlock', {
    method: 'POST',
    ip: '203.0.113.20',
    body: { password: ART_PASSWORD }
  });
  assert.equal(artUnlock.response.status, 200);
  const artCookie = cookieHeader(artUnlock.response.headers.getSetCookie(), ART_COOKIE);
  assert.ok(artCookie.startsWith(`${ART_COOKIE}=`));
  assert.equal(cookieHeader(artUnlock.response.headers.getSetCookie(), ADMIN_COOKIE), '');
  assert.match(artUnlock.response.headers.getSetCookie().join(';'), /HttpOnly/i);

  const adminUnlock = await request(port, '/api/admin/unlock', {
    method: 'POST',
    ip: '203.0.113.21',
    body: { password: ADMIN_PASSWORD }
  });
  assert.equal(adminUnlock.response.status, 200);
  assert.equal(adminUnlock.json.adminUnlocked, true);
  const adminCookie = cookieHeader(adminUnlock.response.headers.getSetCookie(), ADMIN_COOKIE);
  assert.ok(adminCookie.startsWith(`${ADMIN_COOKIE}=`));
  assert.equal(cookieHeader(adminUnlock.response.headers.getSetCookie(), ART_COOKIE), '');

  const artConfig = await request(port, '/api/config', { ip: '203.0.113.22', cookie: artCookie });
  assert.equal(artConfig.json.artUnlocked, true);
  assert.equal(artConfig.json.adminUnlocked, false);
  assert.equal(artConfig.json.artUpload, false);

  const adminAsArt = await request(port, '/api/config', {
    ip: '203.0.113.23',
    cookie: `${ART_COOKIE}=${adminCookie.split('=')[1]}`
  });
  assert.equal(adminAsArt.json.artUnlocked, false);
  assert.equal(adminAsArt.json.adminUnlocked, false);

  const artAsAdmin = await request(port, '/api/config', {
    ip: '203.0.113.24',
    cookie: `${ADMIN_COOKIE}=${artCookie.split('=')[1]}`
  });
  assert.equal(artAsAdmin.json.artUnlocked, false);
  assert.equal(artAsAdmin.json.adminUnlocked, false);

  const adminConfig = await request(port, '/api/config', { ip: '203.0.113.25', cookie: adminCookie });
  assert.equal(adminConfig.json.adminUnlocked, true);
  assert.equal(adminConfig.json.artUnlocked, false);
  assert.equal(adminConfig.json.artUpload, true);

  const writes = [
    ['POST', '/api/user-monsters', { name: 'Probe' }],
    ['PUT', '/api/user-monsters', { name: 'Probe' }],
    ['PUT', '/api/user-monsters/1', { name: 'Probe' }],
    ['PATCH', '/api/user-monsters/1/name', { name: 'Probe' }],
    ['DELETE', '/api/user-monsters/1'],
    ['PUT', '/api/user-monsters/1/image', { imageDataUrl: 'data:image/png;base64,AA==' }],
    ['PUT', '/api/monsters/1/image', { imageDataUrl: 'data:image/png;base64,AA==' }]
  ];

  for (const [method, path, body] of writes) {
    const anonymous = await request(port, path, { method, ip: '203.0.113.30', body });
    assert.equal(anonymous.response.status, 401, `${method} ${path} without a cookie`);
    assert.equal(anonymous.json.error, 'Admin unlock required.');

    const withArt = await request(port, path, { method, ip: '203.0.113.31', body, cookie: artCookie });
    assert.equal(withArt.response.status, 401, `${method} ${path} with the art cookie`);
  }

  const wrong = 'not-the-admin-secret';
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const failed = await request(port, '/api/admin/unlock', {
      method: 'POST',
      ip: '203.0.113.40',
      body: { password: wrong }
    });
    assert.equal(failed.response.status, attempt === 5 ? 429 : 401);
    assert.equal(failed.text.includes(wrong), false);
  }
  const locked = await request(port, '/api/admin/unlock', {
    method: 'POST',
    ip: '203.0.113.40',
    body: { password: ADMIN_PASSWORD }
  });
  assert.equal(locked.response.status, 429);
  assert.equal(Number(locked.response.headers.get('retry-after')) > 0, true);
  assert.equal(locked.text.includes(ADMIN_PASSWORD), false);
  assert.equal(locked.text.includes(wrong), false);

  const otherIp = await request(port, '/api/admin/unlock', {
    method: 'POST',
    ip: '203.0.113.41',
    body: { password: ADMIN_PASSWORD }
  });
  assert.equal(otherIp.response.status, 200);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const failed = await request(port, '/api/art/unlock', {
      method: 'POST',
      ip: '203.0.113.50',
      body: { password: 'nope' }
    });
    assert.equal(failed.response.status, 401);
  }

  const previousUnlock = process.env.ADMIN_UNLOCK_SECRET;
  const previousCookie = process.env.ADMIN_COOKIE_SECRET;
  try {
    process.env.ADMIN_UNLOCK_SECRET = 'too-short';
    const unconfigured = await request(port, '/api/admin/unlock', {
      method: 'POST',
      ip: '203.0.113.60',
      body: { password: 'too-short' }
    });
    assert.equal(unconfigured.response.status, 503);
    assert.equal(unconfigured.text.includes('too-short'), false);

    process.env.ADMIN_UNLOCK_SECRET = ADMIN_PASSWORD;
    process.env.ADMIN_COOKIE_SECRET = '';
    const missingKey = await request(port, '/api/admin/unlock', {
      method: 'POST',
      ip: '203.0.113.61',
      body: { password: ADMIN_PASSWORD }
    });
    assert.equal(missingKey.response.status, 503);
    assert.equal(missingKey.text.includes(ADMIN_PASSWORD), false);
  } finally {
    process.env.ADMIN_UNLOCK_SECRET = previousUnlock;
    process.env.ADMIN_COOKIE_SECRET = previousCookie;
  }

  const logged = warnings.join('\n');
  assert.equal(logged.includes(wrong), false);
  assert.equal(logged.includes(ADMIN_PASSWORD), false);
  assert.equal(logged.includes(ART_PASSWORD), false);
  assert.match(logged, /\[admin-unlock] failed ip=203\.0\.113\.40/);
  assert.match(logged, /\[admin-unlock] locked-out ip=203\.0\.113\.40/);
});
