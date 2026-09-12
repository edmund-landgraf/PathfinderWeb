import assert from 'node:assert/strict';
import { test } from 'node:test';

const API_BASE = process.env.API_BASE || 'http://localhost:3333';
const stamp = Date.now();
const createdName = `UnitTest Custom Monster ${stamp}`;
const updatedName = `${createdName} Updated`;

async function requestJson(method, path, { body, expectJson = true } = {}) {
  const response = await fetch(new URL(path, API_BASE), {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let json = null;
  if (expectJson && text) {
    json = JSON.parse(text);
  }

  return { response, text, json };
}

test('GET /api/health is reachable', async () => {
  const { response, json } = await requestJson('GET', '/api/health');
  assert.equal(response.status, 200);
  assert.ok(json);
});

test('POST /api/user-monsters rejects a missing name', async () => {
  const { response, json } = await requestJson('POST', '/api/user-monsters', {
    body: { level: 1 }
  });
  assert.equal(response.status, 400);
  assert.match(String(json?.error || ''), /name/i);
});

test('custom monster upsert and delete round trip', async (t) => {
  let userMonsterId;

  t.after(async () => {
    if (!userMonsterId) return;
    await fetch(new URL(`/api/user-monsters/${userMonsterId}`, API_BASE), { method: 'DELETE' });
  });

  const created = await requestJson('POST', '/api/user-monsters', {
    body: {
      name: createdName,
      level: 3,
      rarity: 'Uncommon',
      size: 'Medium',
      family: 'Unit Test',
      gameSystem: 'PF2',
      hp: 40,
      ac: 18,
      rawMD: '# Unit test custom monster'
    }
  });

  assert.equal(created.response.status, 201);
  userMonsterId = created.json?.UserMonsterId;
  assert.ok(Number.isInteger(userMonsterId) && userMonsterId > 0);
  assert.equal(created.json.Name, createdName);
  assert.equal(created.json.Level, 3);
  assert.equal(created.json.MonsterId, -userMonsterId);
  assert.equal(created.json.ContentType, 'user generated');

  const updated = await requestJson('PUT', `/api/user-monsters/${userMonsterId}`, {
    body: {
      name: updatedName,
      level: 4,
      rarity: 'Rare',
      size: 'Large',
      family: 'Unit Test',
      gameSystem: 'PF2',
      hp: 55,
      ac: 20,
      rawMD: '# Updated unit test custom monster'
    }
  });

  assert.equal(updated.response.status, 200);
  assert.equal(updated.json.UserMonsterId, userMonsterId);
  assert.equal(updated.json.Name, updatedName);
  assert.equal(updated.json.Level, 4);
  assert.equal(updated.json.HP, 55);

  const listed = await requestJson(
    'GET',
    `/api/monsters?name=${encodeURIComponent(updatedName)}&contentType=${encodeURIComponent('user generated')}&limit=20`
  );
  assert.equal(listed.response.status, 200);
  const match = (listed.json.rows || []).find((row) => row.UserMonsterId === userMonsterId);
  assert.ok(match, 'updated custom monster should appear in monster search');
  assert.equal(match.Name, updatedName);

  const deleted = await requestJson('DELETE', `/api/user-monsters/${userMonsterId}`, {
    expectJson: false
  });
  assert.equal(deleted.response.status, 204);

  const deletedAgain = await requestJson('DELETE', `/api/user-monsters/${userMonsterId}`);
  assert.equal(deletedAgain.response.status, 404);

  userMonsterId = null;
});

test('PUT and DELETE reject invalid ids', async () => {
  const put = await requestJson('PUT', '/api/user-monsters/not-an-id', {
    body: { name: 'Invalid Id' }
  });
  assert.equal(put.response.status, 400);

  const del = await requestJson('DELETE', '/api/user-monsters/0');
  assert.equal(del.response.status, 400);
});
