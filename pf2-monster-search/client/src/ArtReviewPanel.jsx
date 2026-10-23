import React, { useCallback, useEffect, useState } from 'react';

// Minimal admin review queue for art uploaded with the shared art password.
// API: GET /api/admin/art/uploads, POST .../:id/approve|reject, POST /api/admin/art/rollback
async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.skipped || `HTTP ${res.status}`);
  return data;
}

const fmt = (v) => (v ? new Date(v).toLocaleString() : '');

export default function ArtReviewPanel({ onClose }) {
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const q = status === 'suspect' ? 'suspect=true' : `status=${status}`;
      setRows((await api(`/api/admin/art/uploads?${q}&limit=200`)).rows || []);
    } catch (err) {
      setError(err.message);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  async function act(fn) {
    setBusy(true);
    setError('');
    try { await fn(); await load(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  const rollbackVersion = () => act(async () => {
    const v = version.trim();
    if (!v) throw new Error('Enter a password version.');
    const dry = await api('/api/admin/art/rollback', { method: 'POST', body: JSON.stringify({ version: v, dryRun: true }) });
    if (!window.confirm(`Roll back ${dry.count} upload(s) from art password v${v}?`)) return;
    const out = await api('/api/admin/art/rollback', { method: 'POST', body: JSON.stringify({ version: v }) });
    window.alert(`Restored ${out.restored}; skipped ${out.skipped.length} (newer art exists).`);
  });

  return (
    <div className="modal-backdrop settingsPasswordBackdrop" onClick={onClose}>
      <div className="settingsPasswordModal artReviewPanel" onClick={(e) => e.stopPropagation()}>
        <h2>Uploaded art</h2>
        <div className="actions artReviewToolbar">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">Pending review</option>
            <option value="auto_approved">Auto-approved</option>
            <option value="approved">Approved</option>
            <option value="rejected,rolled_back">Rejected / rolled back</option>
            <option value="suspect">Suspect (retired password)</option>
          </select>
          <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Password version" />
          <button type="button" disabled={busy} onClick={rollbackVersion}>Roll back version</button>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        {error && <p className="error">{error}</p>}
        {!rows.length && <p>No uploads.</p>}
        <div className="artReviewList">
          {rows.map((row) => (
            <div key={row.ArtUploadId} className="artReviewRow">
              {row.Action === 'upload' && ['pending', 'approved', 'auto_approved'].includes(row.Status)
                ? <img src={`${row.previewUrl}?u=${row.ArtUploadId}`} alt="" loading="lazy" />
                : <div className="artReviewNoImg">-</div>}
              <div>
                <strong>{row.TargetType} #{row.TargetId}</strong> · {row.Status}{row.suspect ? ' · SUSPECT' : ''}<br />
                <small>
                  {row.Role === 'art' ? `art v${row.PasswordVersion}${row.PartnerLabel ? ` (${row.PartnerLabel})` : ''}` : 'admin'}
                  {' · '}{row.Ip} · {fmt(row.CreatedAt)}{row.HadPreviousArt ? ' · replaced art' : ''}
                </small>
              </div>
              {['pending', 'auto_approved'].includes(row.Status) && (
                <button type="button" disabled={busy} onClick={() => act(() => api(`/api/admin/art/uploads/${row.ArtUploadId}/approve`, { method: 'POST' }))}>Approve</button>
              )}
              {['pending', 'approved', 'auto_approved'].includes(row.Status) && row.Action === 'upload' && (
                <button type="button" disabled={busy} onClick={() => act(() => api(`/api/admin/art/uploads/${row.ArtUploadId}/reject`, { method: 'POST', body: '{}' }))}>Reject</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
