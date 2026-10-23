import { createHash } from 'node:crypto';
import { parseArtPasswords, matchArtPassword, signArtToken, verifyArtToken } from './passwords.js';
import { createRateLimiter } from './rateLimit.js';
import { decodeUploadBody, sanitizeImage } from './imageCheck.js';
import { SCHEMA_SQL, TARGETS, readCurrentArt, writeArt, LIST_COLUMNS } from './store.js';

const num = (v, d) => (Number.isFinite(Number(v)) && String(v ?? '') !== '' ? Number(v) : d);
const LIVE = ['pending', 'approved', 'auto_approved'];

function httpError(res, err, fallback = 500) {
  const status = err.statusCode || fallback;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Server error' : err.message });
}

/**
 * Art guardrails. server.js supplies existing helpers so admin auth stays as-is.
 * opts: { env, sql, getPool, secret, ttlMs, artCookieName, parseCookies, isAdmin(req),
 *         artUploadsEnabled (bool), onImageChanged(type, id) }
 */
export function createArtGuardrails(opts) {
  const { env = process.env, sql, getPool, secret, ttlMs, artCookieName, parseCookies, isAdmin } = opts;
  const onImageChanged = opts.onImageChanged || (() => {});
  const passwords = parseArtPasswords(env.ART_PASSWORDS, env.ENABLE_ART_PWD);
  const activeVersions = new Set(passwords.map((p) => p.version));
  const labelOf = new Map(passwords.map((p) => [p.version, p.label]));
  const cfg = {
    maxBytes: num(env.ART_MAX_BYTES, 5 * 1024 * 1024),
    maxDimension: num(env.ART_MAX_DIMENSION, 4096),
    autoApproveMs: num(env.ART_AUTO_APPROVE_HOURS, 24) * 3600 * 1000, // 0 = never auto-approve
    reviewQueue: String(env.ART_REVIEW_QUEUE ?? 'true').toLowerCase() !== 'false'
  };
  const perVersion = createRateLimiter({ limit: num(env.ART_UPLOAD_RATE_PER_VERSION, 30), windowMs: 3600e3 });
  const perIp = createRateLimiter({ limit: num(env.ART_UPLOAD_RATE_PER_IP, 20), windowMs: 3600e3 });

  let schemaPromise;
  async function pool() {
    const p = await getPool();
    if (!schemaPromise) schemaPromise = p.request().query(SCHEMA_SQL).catch((e) => { schemaPromise = null; throw e; });
    await schemaPromise;
    return p;
  }

  // ---- sessions --------------------------------------------------------------
  function getArtSession(req) {
    if (!secret) return null;
    const s = verifyArtToken(secret, parseCookies(req)[artCookieName], activeVersions);
    return s ? { version: s.version, label: labelOf.get(s.version) || null } : null;
  }
  const matchPassword = (pw) => matchArtPassword(passwords, pw);
  const signCookie = (match) => signArtToken(secret, match.version, ttlMs);
  const isPrivileged = (req) => Boolean(isAdmin(req) || getArtSession(req));

  // ---- review queue (in-memory mirror of pending rows) --------------------------
  const pending = new Map(); // "type:id" -> createdAt ms
  const key = (type, id) => `${type}:${Number(id)}`;
  async function refreshPending() {
    try {
      const p = await pool();
      if (cfg.autoApproveMs > 0) {
        await p.request().input('ms', sql.BigInt, cfg.autoApproveMs).query(`
          UPDATE pf2.ArtUpload SET Status = N'auto_approved', ReviewedAt = SYSUTCDATETIME()
          WHERE Status = N'pending' AND CreatedAt < DATEADD(SECOND, -CAST(@ms / 1000 AS int), SYSUTCDATETIME());`);
      }
      const r = await p.request().query(`SELECT TargetType, TargetId, CreatedAt FROM pf2.ArtUpload WHERE Status = N'pending';`);
      pending.clear();
      for (const row of r.recordset || []) pending.set(key(row.TargetType, row.TargetId), new Date(row.CreatedAt).getTime());
    } catch (err) {
      console.warn('Art review queue refresh failed:', err.message);
    }
  }
  if (opts.startTimers !== false) {
    refreshPending();
    setInterval(refreshPending, 60e3).unref();
  }
  function isPending(type, id) {
    const at = pending.get(key(type, id));
    if (at === undefined) return false;
    if (cfg.autoApproveMs > 0 && Date.now() - at >= cfg.autoApproveMs) return false;
    return true;
  }
  /** true when this requester must not see the target's art (pending + anonymous). */
  const hidePending = (req, type, id) => isPending(type, id) && !isPrivileged(req);
  /** Clears ImageUrl on list rows whose art is pending, for anonymous viewers. */
  function filterRows(req, rows) {
    if (!pending.size || isPrivileged(req)) return rows;
    for (const row of rows || []) {
      const m = /\/api\/(monsters|user-monsters)\/(-?\d+)\/image/.exec(row?.ImageUrl || '');
      if (m && isPending(m[1] === 'monsters' ? 'monster' : 'user-monster', m[2])) row.ImageUrl = null;
    }
    return rows;
  }
  const cacheControlFor = (type, id, fallback) => (isPending(type, id) ? 'private, no-store' : fallback);

  // ---- upload ------------------------------------------------------------------
  function uploadHandler(type) {
    return async (req, res) => {
      const id = Number(req.params.monsterId ?? req.params.userMonsterId);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

      const admin = isAdmin(req);
      const session = admin ? null : (opts.artUploadsEnabled ? getArtSession(req) : null);
      if (!admin && !session) return res.status(403).json({ error: 'Art upload requires password unlock.' });

      if (!admin) {
        for (const [limiter, k] of [[perIp, `ip:${req.ip}`], [perVersion, `v:${session.version}`]]) {
          const r = limiter.take(k);
          if (!r.ok) {
            res.setHeader('Retry-After', String(r.retryAfterSec));
            return res.status(429).json({ error: 'Too many art uploads. Try again later.' });
          }
        }
      }

      let image;
      try {
        image = await sanitizeImage(decodeUploadBody(req.body || {}, cfg.maxBytes), cfg);
      } catch (err) {
        return httpError(res, err, 400);
      }

      const status = admin || !cfg.reviewQueue ? 'approved' : 'pending';
      let tx;
      try {
        const p = await pool();
        const exists = await p.request().input('id', sql.Int, id).query(TARGETS[type].exists);
        if (!exists.recordset?.[0]) return res.status(404).json({ error: 'Creature not found' });

        tx = new sql.Transaction(p);
        await tx.begin();
        const prev = await readCurrentArt(new sql.Request(tx), type, id);
        if (!admin && prev.image) {
          await tx.rollback(); tx = null;
          return res.status(409).json({ error: 'This creature already has art. Replacing art requires admin.' });
        }
        await writeArt(new sql.Request(tx), sql, type, id, { image: image.buffer, contentType: image.contentType, rowExists: prev.rowExists });
        await new sql.Request(tx)
          .input('type', sql.NVarChar(20), type).input('id', sql.Int, id)
          .input('sha', sql.Char(64), createHash('sha256').update(image.buffer).digest('hex'))
          .input('ct', sql.NVarChar(100), image.contentType).input('bytes', sql.Int, image.buffer.length)
          .input('w', sql.Int, image.width).input('h', sql.Int, image.height)
          .input('prevRow', sql.Bit, prev.rowExists && type === 'monster')
          .input('prevImage', sql.VarBinary(sql.MAX), prev.image).input('prevThumb', sql.VarBinary(sql.MAX), prev.thumb)
          .input('prevCt', sql.NVarChar(100), prev.contentType)
          .input('role', sql.NVarChar(10), admin ? 'admin' : 'art')
          .input('ver', sql.NVarChar(20), session?.version ?? null).input('label', sql.NVarChar(50), session?.label ?? null)
          .input('ip', sql.NVarChar(64), String(req.ip || '').slice(0, 64))
          .input('ua', sql.NVarChar(300), String(req.get('user-agent') || '').slice(0, 300))
          .input('status', sql.NVarChar(20), status)
          .query(`INSERT INTO pf2.ArtUpload (TargetType, TargetId, NewSha256, NewContentType, NewBytes, NewWidth, NewHeight,
                    PrevRowExisted, PrevImage, PrevThumbnail, PrevContentType, Role, PasswordVersion, PartnerLabel, Ip, UserAgent, Status, ReviewedAt)
                  VALUES (@type, @id, @sha, @ct, @bytes, @w, @h, @prevRow, @prevImage, @prevThumb, @prevCt, @role, @ver, @label, @ip, @ua, @status,
                    CASE WHEN @status = N'approved' THEN SYSUTCDATETIME() END);`);
        await tx.commit(); tx = null;

        if (status === 'pending') pending.set(key(type, id), Date.now()); else pending.delete(key(type, id));
        onImageChanged(type, id);
        const base = type === 'monster' ? `/api/monsters/${id}` : `/api/user-monsters/${id}`;
        res.json({ ok: true, status, imageUrl: `${base}/image/thumb` });
      } catch (err) {
        if (tx) await tx.rollback().catch(() => {});
        httpError(res, err);
      }
    };
  }

  // ---- revert (reject / rollback / remove) -----------------------------------------
  // Restores the previous art only if this row is still the latest live change for the target,
  // so rolling back an old batch never clobbers newer art.
  async function revertRow(p, row, newStatus, note) {
    const tx = new sql.Transaction(p);
    await tx.begin();
    try {
      const later = await new sql.Request(tx)
        .input('type', sql.NVarChar(20), row.TargetType).input('id', sql.Int, row.TargetId).input('uid', sql.Int, row.ArtUploadId)
        .query(`SELECT COUNT(*) AS n FROM pf2.ArtUpload WITH (UPDLOCK, HOLDLOCK)
                WHERE TargetType = @type AND TargetId = @id AND ArtUploadId > @uid AND Status IN (N'pending', N'approved', N'auto_approved');`);
      if (later.recordset[0].n > 0) {
        await tx.rollback();
        return { id: row.ArtUploadId, skipped: 'newer art exists for this creature' };
      }
      const full = await new sql.Request(tx).input('uid', sql.Int, row.ArtUploadId)
        .query('SELECT PrevImage, PrevThumbnail, PrevContentType, PrevRowExisted FROM pf2.ArtUpload WHERE ArtUploadId = @uid;');
      const f = full.recordset[0];
      const cur = await readCurrentArt(new sql.Request(tx), row.TargetType, row.TargetId);
      await writeArt(new sql.Request(tx), sql, row.TargetType, row.TargetId, {
        image: f.PrevImage, thumb: f.PrevThumbnail, contentType: f.PrevContentType,
        rowExists: cur.rowExists, deleteRow: row.TargetType === 'monster' && !f.PrevImage && !f.PrevRowExisted && cur.rowExists
      });
      await new sql.Request(tx).input('uid', sql.Int, row.ArtUploadId).input('st', sql.NVarChar(20), newStatus)
        .input('note', sql.NVarChar(200), note ? String(note).slice(0, 200) : null)
        .query('UPDATE pf2.ArtUpload SET Status = @st, ReviewedAt = SYSUTCDATETIME(), ReviewNote = @note WHERE ArtUploadId = @uid;');
      await tx.commit();
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
    pending.delete(key(row.TargetType, row.TargetId));
    onImageChanged(row.TargetType, row.TargetId);
    return { id: row.ArtUploadId, restored: true };
  }

  function buildFilter(request, q) {
    const where = [];
    if (q.status) {
      const list = String(q.status).split(',').filter((s) => /^[a-z_]+$/.test(s));
      list.forEach((s, i) => request.input(`s${i}`, sql.NVarChar(20), s));
      if (list.length) where.push(`Status IN (${list.map((_, i) => `@s${i}`).join(', ')})`);
    }
    if (q.version) { request.input('ver', sql.NVarChar(20), String(q.version).replace(/^v/i, '')); where.push('PasswordVersion = @ver'); }
    if (q.label) { request.input('label', sql.NVarChar(50), String(q.label)); where.push('PartnerLabel = @label'); }
    if (q.ip) { request.input('ip', sql.NVarChar(64), String(q.ip)); where.push('Ip = @ip'); }
    if (q.role) { request.input('role', sql.NVarChar(10), String(q.role)); where.push('Role = @role'); }
    for (const [name, op] of [['from', '>='], ['to', '<=']]) {
      if (!q[name]) continue;
      const d = new Date(q[name]);
      if (Number.isNaN(d.getTime())) { const e = new Error(`Invalid ${name} date`); e.statusCode = 400; throw e; }
      request.input(name, sql.DateTime2(3), d); where.push(`CreatedAt ${op} @${name}`);
    }
    if (q.suspect === 'true' || q.suspect === true) {
      const vs = [...activeVersions];
      vs.forEach((v, i) => request.input(`av${i}`, sql.NVarChar(20), v));
      where.push(`Role = N'art' AND (PasswordVersion IS NULL${vs.length ? ` OR PasswordVersion NOT IN (${vs.map((_, i) => `@av${i}`).join(', ')})` : ''})`);
    }
    return where;
  }

  const adminOnly = (fn) => async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin password unlock required.' });
    try { await fn(req, res); } catch (err) { httpError(res, err); }
  };

  function registerRoutes(app) {
    app.get('/api/admin/art/uploads', adminOnly(async (req, res) => {
      const p = await pool();
      const r = p.request();
      const where = buildFilter(r, req.query);
      r.input('limit', sql.Int, Math.min(Math.max(num(req.query.limit, 100), 1), 500));
      const result = await r.query(`SELECT TOP (@limit) ${LIST_COLUMNS} FROM pf2.ArtUpload
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ArtUploadId DESC;`);
      res.json({
        rows: (result.recordset || []).map((row) => ({
          ...row,
          suspect: row.Role === 'art' && !activeVersions.has(row.PasswordVersion),
          previewUrl: `${row.TargetType === 'monster' ? '/api/monsters' : '/api/user-monsters'}/${row.TargetId}/image`
        }))
      });
    }));

    app.get('/api/admin/art/versions', adminOnly(async (_req, res) => {
      const p = await pool();
      const r = await p.request().query(`SELECT PasswordVersion, PartnerLabel, Status, COUNT(*) AS Uploads, MAX(CreatedAt) AS LastUpload
        FROM pf2.ArtUpload WHERE Role = N'art' GROUP BY PasswordVersion, PartnerLabel, Status;`);
      res.json({
        active: passwords.map((p2) => ({ version: p2.version, label: p2.label })),
        uploads: (r.recordset || []).map((row) => ({ ...row, retired: !activeVersions.has(row.PasswordVersion) }))
      });
    }));

    app.post('/api/admin/art/uploads/:id/approve', adminOnly(async (req, res) => {
      const p = await pool();
      const r = await p.request().input('uid', sql.Int, Number(req.params.id))
        .query(`UPDATE pf2.ArtUpload SET Status = N'approved', ReviewedAt = SYSUTCDATETIME()
                OUTPUT inserted.TargetType, inserted.TargetId
                WHERE ArtUploadId = @uid AND Status IN (N'pending', N'auto_approved');`);
      const row = r.recordset?.[0];
      if (!row) return res.status(404).json({ error: 'No pending upload with that id' });
      pending.delete(key(row.TargetType, row.TargetId));
      onImageChanged(row.TargetType, row.TargetId);
      res.json({ ok: true });
    }));

    app.post('/api/admin/art/uploads/:id/reject', adminOnly(async (req, res) => {
      const p = await pool();
      const r = await p.request().input('uid', sql.Int, Number(req.params.id))
        .query(`SELECT ArtUploadId, TargetType, TargetId, Status FROM pf2.ArtUpload WHERE ArtUploadId = @uid;`);
      const row = r.recordset?.[0];
      if (!row || !LIVE.includes(row.Status)) return res.status(404).json({ error: 'No live upload with that id' });
      const out = await revertRow(p, row, 'rejected', req.body?.note);
      res.status(out.skipped ? 409 : 200).json(out);
    }));

    // Body: { version?, label?, ip?, from?, to?, suspect?, ids?: number[], dryRun?: bool }
    app.post('/api/admin/art/rollback', adminOnly(async (req, res) => {
      const body = req.body || {};
      const p = await pool();
      const r = p.request();
      const where = buildFilter(r, { ...body, status: undefined });
      if (Array.isArray(body.ids) && body.ids.length) {
        const ids = body.ids.map(Number).filter(Number.isInteger).slice(0, 1000);
        ids.forEach((v, i) => r.input(`id${i}`, sql.Int, v));
        where.push(`ArtUploadId IN (${ids.map((_, i) => `@id${i}`).join(', ') || 'NULL'})`);
      }
      if (!where.length) return res.status(400).json({ error: 'Give at least one filter: version, label, ip, from/to, suspect, or ids.' });
      where.push(`Status IN (N'pending', N'approved', N'auto_approved')`, `Action = N'upload'`);
      const rows = (await r.query(`SELECT ArtUploadId, TargetType, TargetId FROM pf2.ArtUpload
        WHERE ${where.join(' AND ')} ORDER BY ArtUploadId DESC;`)).recordset || [];
      if (body.dryRun) return res.json({ dryRun: true, count: rows.length, ids: rows.map((x) => x.ArtUploadId) });
      const results = [];
      for (const row of rows) results.push(await revertRow(p, row, 'rolled_back', body.note || 'batch rollback'));
      res.json({ ok: true, restored: results.filter((x) => x.restored).length, skipped: results.filter((x) => x.skipped), results });
    }));

    // Admin-only removal of existing art (audited; reversible via the audit row's previous value).
    app.delete('/api/admin/art/:type/:id', adminOnly(async (req, res) => {
      const type = req.params.type;
      const id = Number(req.params.id);
      if (!TARGETS[type] || !Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid target' });
      const p = await pool();
      const tx = new sql.Transaction(p);
      await tx.begin();
      try {
        const prev = await readCurrentArt(new sql.Request(tx), type, id);
        if (!prev.image) { await tx.rollback(); return res.status(404).json({ error: 'No art to remove' }); }
        await writeArt(new sql.Request(tx), sql, type, id, { image: null, thumb: null, contentType: null, rowExists: prev.rowExists });
        await new sql.Request(tx).input('type', sql.NVarChar(20), type).input('id', sql.Int, id)
          .input('prevRow', sql.Bit, prev.rowExists && type === 'monster')
          .input('prevImage', sql.VarBinary(sql.MAX), prev.image).input('prevThumb', sql.VarBinary(sql.MAX), prev.thumb)
          .input('prevCt', sql.NVarChar(100), prev.contentType).input('ip', sql.NVarChar(64), String(req.ip || '').slice(0, 64))
          .query(`INSERT INTO pf2.ArtUpload (TargetType, TargetId, Action, PrevRowExisted, PrevImage, PrevThumbnail, PrevContentType, Role, Ip, Status, ReviewedAt)
                  VALUES (@type, @id, N'remove', @prevRow, @prevImage, @prevThumb, @prevCt, N'admin', @ip, N'approved', SYSUTCDATETIME());`);
        await tx.commit();
      } catch (err) {
        await tx.rollback().catch(() => {});
        throw err;
      }
      pending.delete(key(type, id));
      onImageChanged(type, id);
      res.json({ ok: true });
    }));
  }

  return {
    config: cfg, activeVersions,
    matchPassword, signCookie, getArtSession, isPrivileged,
    hasSecret: () => Boolean(secret),
    hidePending, filterRows, cacheControlFor, isPending,
    uploadHandler, registerRoutes, refreshPending
  };
}
