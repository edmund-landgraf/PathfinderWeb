import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, RotateCcw, ExternalLink, Image as ImageIcon, Columns3 } from 'lucide-react';
import './styles.css';


const emptyFilters = {
  name: '',
  levelMin: '',
  levelMax: '',
  rarity: '',
  size: '',
  alignment: '',
  family: '',
  sourceBook: '',
  text: '',
  languages: '',
  skills: '',
  senses: '',
  speed: '',
  hpMin: '',
  hpMax: '',
  acMin: '',
  acMax: '',
  isNPC: '',
  isUnique: '',
  limit: '100'
};

const columns = [
  ['Name', 'Name'],
  ['Level', 'Level'],
  ['Rarity', 'Rarity'],
  ['Size', 'Size'],
  ['Alignment', 'Align'],
  ['Family', 'Family'],
  ['SourceBook', 'Source'],
  ['HP', 'HP'],
  ['AC', 'AC'],
  ['Fortitude', 'Fort'],
  ['Reflex', 'Ref'],
  ['Will', 'Will'],
  ['Perception', 'Perc'],
  ['Speed', 'Speed'],
  ['Languages', 'Languages'],
  ['Skills', 'Skills']
];

function buildQuery(filters, offset, sortBy, sortDir) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params.set(key, String(value).trim());
    }
  }
  params.set('offset', String(offset));
  params.set('sortBy', sortBy);
  params.set('sortDir', sortDir);
  return params.toString();
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function TextInput({ value, onChange, placeholder }) {
  return <input value={value} placeholder={placeholder || ''} onChange={e => onChange(e.target.value)} />;
}

function SelectInput({ value, onChange, options, placeholder }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder || 'Any'}</option>
      {options.map(x => <option key={`${x.id}-${x.name}`} value={x.name}>{x.name}</option>)}
    </select>
  );
}

function BoolSelect({ value, onChange }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Any</option>
      <option value="true">Yes</option>
      <option value="false">No</option>
    </select>
  );
}

function App() {
  const [filters, setFilters] = useState(emptyFilters);
  const [lookups, setLookups] = useState({ rarity: [], size: [], alignment: [], family: [], sourceBook: [] });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState('Name');
  const [sortDir, setSortDir] = useState('asc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [selectedMonster, setSelectedMonster] = useState(null);
  const [layout, setLayout] = useState('right');


  const limit = useMemo(() => Math.min(Math.max(Number(filters.limit || 100), 1), 500), [filters.limit]);

  function setFilter(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  async function fetchLookups() {
    const res = await fetch('/api/lookups');
    if (!res.ok) throw new Error(await res.text());
    setLookups(await res.json());
  }

  async function search(newOffset = 0) {
    setLoading(true);
    setError('');
    try {
      const qs = buildQuery(filters, newOffset, sortBy, sortDir);
      const res = await fetch(`/api/monsters?${qs}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRows(data.rows || []);
      setTotal(data.total || 0);
      setOffset(data.offset || 0);
      setSelected((data.rows || [])[0] || null);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLookups().catch(err => setError(err.message || String(err)));
  }, []);

  useEffect(() => {
    search(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortDir]);

  function reset() {
    setFilters(emptyFilters);
    setOffset(0);
    setRows([]);
    setTotal(0);
    setSelected(null);
    setTimeout(() => search(0), 0);
  }

  function changeSort(col) {
    if (sortBy === col) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  }

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + limit, total);

  return (
    <>
    <div className="app">
      <header className="topbar">
        <div>
          <h1>PF2 Monster Search</h1>
          <p>Search `pf2.vwMonsterFull` by creature fields and browse results.</p>
        </div>
        <button className="layoutButton" onClick={() => setLayout(layout === 'right' ? 'below' : 'right')}>
          <Columns3 size={16} /> Grid {layout === 'right' ? 'right' : 'below'}
        </button>
      </header>

      <main className={layout === 'right' ? 'split splitRight' : 'split splitBelow'}>
        <aside className="searchPanel">
          <div className="panelTitle"><Search size={18} /> Search Fields</div>

          <div className="fieldGrid">
            <Field label="Name"><TextInput value={filters.name} onChange={v => setFilter('name', v)} placeholder="dragon, goblin..." /></Field>
            <Field label="Text"><TextInput value={filters.text} onChange={v => setFilter('text', v)} placeholder="breath, grab..." /></Field>

            <Field label="Level min"><TextInput value={filters.levelMin} onChange={v => setFilter('levelMin', v)} /></Field>
            <Field label="Level max"><TextInput value={filters.levelMax} onChange={v => setFilter('levelMax', v)} /></Field>

            <Field label="Rarity"><SelectInput value={filters.rarity} onChange={v => setFilter('rarity', v)} options={lookups.rarity} /></Field>
            <Field label="Size"><SelectInput value={filters.size} onChange={v => setFilter('size', v)} options={lookups.size} /></Field>
            <Field label="Alignment"><SelectInput value={filters.alignment} onChange={v => setFilter('alignment', v)} options={lookups.alignment} /></Field>

            <Field label="Family"><TextInput value={filters.family} onChange={v => setFilter('family', v)} placeholder="dragon, serpentfolk..." /></Field>
            <Field label="Source"><TextInput value={filters.sourceBook} onChange={v => setFilter('sourceBook', v)} placeholder="Monster Core" /></Field>

            <Field label="Languages"><TextInput value={filters.languages} onChange={v => setFilter('languages', v)} /></Field>
            <Field label="Skills"><TextInput value={filters.skills} onChange={v => setFilter('skills', v)} /></Field>
            <Field label="Senses"><TextInput value={filters.senses} onChange={v => setFilter('senses', v)} /></Field>
            <Field label="Speed"><TextInput value={filters.speed} onChange={v => setFilter('speed', v)} /></Field>

            <Field label="HP min"><TextInput value={filters.hpMin} onChange={v => setFilter('hpMin', v)} /></Field>
            <Field label="HP max"><TextInput value={filters.hpMax} onChange={v => setFilter('hpMax', v)} /></Field>
            <Field label="AC min"><TextInput value={filters.acMin} onChange={v => setFilter('acMin', v)} /></Field>
            <Field label="AC max"><TextInput value={filters.acMax} onChange={v => setFilter('acMax', v)} /></Field>

            <Field label="NPC"><BoolSelect value={filters.isNPC} onChange={v => setFilter('isNPC', v)} /></Field>
            <Field label="Unique"><BoolSelect value={filters.isUnique} onChange={v => setFilter('isUnique', v)} /></Field>
            <Field label="Limit"><TextInput value={filters.limit} onChange={v => setFilter('limit', v)} /></Field>
          </div>

          <div className="actions">
            <button className="primary" onClick={() => search(0)} disabled={loading}><Search size={16} /> Search</button>
            <button onClick={reset} disabled={loading}><RotateCcw size={16} /> Reset</button>
          </div>

          {selected && <DetailCard monster={selected} />}
        </aside>

        <section className="resultsPanel">
          <div className="resultsHeader">
            <div>
              <strong>{loading ? 'Loading...' : `${pageStart}-${pageEnd} of ${total}`}</strong>
              {error && <span className="error"> {error}</span>}
            </div>
            <div className="pager">
              <button disabled={loading || offset === 0} onClick={() => search(Math.max(0, offset - limit))}>Prev</button>
              <button disabled={loading || offset + limit >= total} onClick={() => search(offset + limit)}>Next</button>
            </div>
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Art</th>
                  {columns.map(([key, label]) => (
                    <th key={key} onClick={() => changeSort(key)}>
                      {label}
                      {sortBy === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.map(row => (
                  <tr
                    key={row.MonsterId}
                    onClick={() => setSelected(row)}
                    onDoubleClick={() => setSelectedMonster(row)}
                    className={selected?.MonsterId === row.MonsterId ? 'selected' : ''}
                    title="Double-click to open full monster details"
                  >
                    <td className="artCell">
                      {row.ImageUrl ? (
                        <img src={row.ImageUrl} alt={row.Name || ''} />
                      ) : (
                        <ImageIcon size={18} />
                      )}
                    </td>

                    {columns.map(([key]) => (
                      <td key={key} title={row[key] ?? ''}>
                        {String(row[key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}

                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 1} className="empty">
                      No results.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>

    {selectedMonster && (
      <MonsterModal
        monster={selectedMonster}
        onClose={() => setSelectedMonster(null)}
      />
    )}
  </>
  );
}

function DetailCard({ monster }) {
  return (
    <div className="detailCard">
      <div className="detailTop">
        {monster.ImageUrl ? <img src={monster.ImageUrl} alt={monster.Name} /> : <div className="noArt"><ImageIcon /></div>}
        <div>
          <h2>{monster.Name}</h2>
          <div className="muted">Level {monster.Level ?? '?'} {monster.Rarity || ''} {monster.Size || ''}</div>
          <div className="chips">
            {monster.Alignment && <span>{monster.Alignment}</span>}
            {monster.Family && <span>{monster.Family}</span>}
            {monster.IsNPC && <span>NPC</span>}
            {monster.IsUnique && <span>Unique</span>}
          </div>
          {monster.AonUrl && <a href={monster.AonUrl} target="_blank" rel="noreferrer">Open AoN <ExternalLink size={13} /></a>}
        </div>
      </div>
      <div className="statLine">
        <b>HP</b> {monster.HP ?? '-'} <b>AC</b> {monster.AC ?? '-'} <b>Fort</b> {monster.Fortitude ?? '-'} <b>Ref</b> {monster.Reflex ?? '-'} <b>Will</b> {monster.Will ?? '-'}
      </div>
      <div className="statLine"><b>Perception</b> {monster.Perception ?? '-'} <b>Speed</b> {monster.Speed || '-'}</div>
      <div className="detailBlock"><b>Languages</b><p>{monster.Languages || '-'}</p></div>
      <div className="detailBlock"><b>Skills</b><p>{monster.Skills || '-'}</p></div>
      <div className="detailBlock"><b>Source</b><p>{monster.SourceBook || '-'} {monster.SourcePage ? `pg. ${monster.SourcePage}` : ''}</p></div>
    </div>
  );
}

function isUrlField(key, value) {
  return (
    key.toLowerCase().includes('url') &&
    typeof value === 'string' &&
    value.startsWith('http')
  );
}

function isRawField(key) {
  return key.toLowerCase().startsWith('raw');
}

function MonsterModal({ monster, onClose }) {
  const normalFields = Object.entries(monster).filter(([key]) => !isRawField(key));
  const rawFields = Object.entries(monster).filter(([key]) => isRawField(key));

  function renderValue(key, value) {
    if (value === null || value === undefined) return '';

    if (isUrlField(key, value)) {
      return (
        <a href={value} target="_blank" rel="noreferrer" className="modal-link">
          {value}
        </a>
      );
    }

    return String(value);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="monster-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>

        <div className="modal-header">
          {monster.ImageUrl ? (
            <img className="modal-image" src={monster.ImageUrl} alt={monster.Name} />
          ) : (
            <div className="modal-no-art"><ImageIcon /></div>
          )}

          <div>
            <h2 className="modal-title">{monster.Name}</h2>
            <div className="modal-subtitle">
              Level {monster.Level ?? '?'} · {monster.Rarity || '-'} · {monster.Size || '-'} · {monster.Alignment || '-'}
            </div>

            <div className="modal-pill-row">
              {monster.Family && <span className="modal-pill">{monster.Family}</span>}
              {monster.SourceBook && <span className="modal-pill">{monster.SourceBook}</span>}
              {monster.IsNPC && <span className="modal-pill">NPC</span>}
              {monster.IsUnique && <span className="modal-pill">Unique</span>}
            </div>

            {monster.AonUrl && (
              <a className="modal-link" href={monster.AonUrl} target="_blank" rel="noreferrer">
                Open AoN <ExternalLink size={13} />
              </a>
            )}
          </div>
        </div>

        <div className="modal-section">
          <h3>Core Stats</h3>
          <div className="modal-stat-grid">
            {['HP','AC','Fortitude','Reflex','Will','Perception','StrMod','DexMod','ConMod','IntMod','WisMod','ChaMod'].map((key) => (
              <div key={key} className="modal-stat">
                <span className="modal-stat-label">{key}</span>
                <span className="modal-stat-value">{monster[key] ?? '-'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-section">
          <h3>All Monster Fields</h3>
          <div className="modal-field-grid">
            {normalFields.map(([key, value]) => (
              <div className="modal-field" key={key}>
                <div className="modal-field-label">{key}</div>
                <div className="modal-field-value">{renderValue(key, value)}</div>
              </div>
            ))}
          </div>
        </div>

        {rawFields.length > 0 && (
          <div className="modal-section">
            <details>
              <summary className="raw-summary">Raw Fields</summary>

              <div className="modal-field-grid raw-fields">
                {rawFields.map(([key, value]) => (
                  <div className="modal-field" key={key}>
                    <div className="modal-field-label">{key}</div>
                    <pre className="modal-raw">{String(value ?? '')}</pre>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}


createRoot(document.getElementById('root')).render(<App />);
