import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import { Search, RotateCcw, ExternalLink, Image as ImageIcon, BookOpen, Award, Package, UserRound } from 'lucide-react';
import remarkGfm from 'remark-gfm';
import {
  extractMarkdownDescriptionMonster,
  extractMarkdownDescriptionFeatsEquipSpells,
  extractMarkdownRemainderFeatsEquipSpells
} from './markdownExtract.js';
import { utilitiesUpdatesDescription, webUpdatesDescription } from './updatesDescriptions.js';
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
  isUnique: '',
  limit: '100'
};

const emptySpellFilters = {
  name: '',
  text: '',
  rankMin: '',
  rankMax: '',
  spellType: '',
  rarity: '',
  sourceBook: '',
  tradition: '',
  trait: '',
  actions: '',
  defense: '',
  duration: '',
  limit: '100'
};

const emptyFeatFilters = {
  name: '',
  text: '',
  levelMin: '',
  levelMax: '',
  featType: '',
  rarity: '',
  sourceBook: '',
  trait: '',
  pfs: '',
  isStandardAncestryFeat: '',
  limit: '100'
};

const emptyEquipmentFilters = {
  name: '',
  text: '',
  levelMin: '',
  levelMax: '',
  equipmentType: '',
  searchCategory: '',
  itemCategory: '',
  itemSubcategory: '',
  rarity: '',
  sourceBook: '',
  trait: '',
  pfs: '',
  price: '',
  bulk: '',
  priceMin: '',
  priceMax: '',
  weaponCategory: '',
  weaponGroup: '',
  weaponType: '',
  damageType: '',
  armorCategory: '',
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

const spellColumns = [
  ['Name', 'Name'],
  ['Rank', 'Rank'],
  ['SpellType', 'Type'],
  ['Traditions', 'Traditions'],
  ['Rarity', 'Rarity'],
  ['Traits', 'Traits'],
  ['SourceBook', 'Source'],
  ['Actions', 'Actions'],
  ['Defense', 'Defense'],
  ['RangeText', 'Range'],
  ['Area', 'Area'],
  ['Duration', 'Duration'],
  ['Summary', 'Summary']
];

const featColumns = [
  ['Name', 'Name'],
  ['Level', 'Level'],
  ['FeatType', 'Type'],
  ['Rarity', 'Rarity'],
  ['Traits', 'Traits'],
  ['SourceBook', 'Source'],
  ['PFS', 'PFS'],
  ['IsStandardAncestryFeat', 'Std Ancestry'],
  ['Summary', 'Summary']
];

const equipmentColumns = [
  ['Name', 'Name'],
  ['Level', 'Level'],
  ['EquipmentType', 'Type'],
  ['SearchCategory', 'Search'],
  ['ItemCategory', 'Category'],
  ['ItemSubcategory', 'Subcategory'],
  ['Rarity', 'Rarity'],
  ['Traits', 'Traits'],
  ['SourceBook', 'Source'],
  ['PriceText', 'Price'],
  ['BulkText', 'Bulk'],
  ['WeaponCategory', 'Weapon'],
  ['ArmorCategory', 'Armor'],
  ['Summary', 'Summary']
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

function isNestedPopoutOpen() {
  return Boolean(document.querySelector('.md-popout-backdrop, .image-popout-backdrop'));
}

function isEditableTarget(target) {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  return Boolean(element.closest('input, textarea, select, [contenteditable="true"]'));
}

function scrollResultRowIntoView(rowId) {
  requestAnimationFrame(() => {
    document.querySelector(`tr[data-row-id="${rowId}"]`)?.scrollIntoView({ block: 'nearest' });
  });
}

function useModalRowNavigation({ rows, activeRecord, onChange, idField }) {
  useEffect(() => {
    if (!activeRecord) return;

    function handleKeyDown(event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (isEditableTarget(event.target)) return;
      if (isNestedPopoutOpen()) return;

      const index = rows.findIndex((row) => row[idField] === activeRecord[idField]);
      if (index === -1) return;

      const nextIndex = event.key === 'ArrowLeft' ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= rows.length) return;

      event.preventDefault();
      const nextRow = rows[nextIndex];
      onChange(nextRow);
      scrollResultRowIntoView(nextRow[idField]);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [rows, activeRecord, onChange, idField]);
}

function useGridRowNavigation({ rows, selected, onChange, idField, enabled = true }) {
  useEffect(() => {
    if (!enabled || !selected) return;

    function handleKeyDown(event) {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      if (isEditableTarget(event.target)) return;
      if (isNestedPopoutOpen()) return;

      const index = rows.findIndex((row) => row[idField] === selected[idField]);
      if (index === -1) return;

      const nextIndex = event.key === 'ArrowUp' ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= rows.length) return;

      event.preventDefault();
      const nextRow = rows[nextIndex];
      onChange(nextRow);
      scrollResultRowIntoView(nextRow[idField]);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [rows, selected, onChange, idField, enabled]);
}

function useModalEscape({
  onClose,
  isMDPopoutOpen,
  setIsMDPopoutOpen,
  isImagePopoutOpen,
  setIsImagePopoutOpen
}) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key !== 'Escape') return;
      if (isEditableTarget(event.target)) return;

      if (isImagePopoutOpen) {
        event.preventDefault();
        setIsImagePopoutOpen(false);
        return;
      }

      if (isMDPopoutOpen) {
        event.preventDefault();
        setIsMDPopoutOpen(false);
        return;
      }

      event.preventDefault();
      onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    onClose,
    isMDPopoutOpen,
    setIsMDPopoutOpen,
    isImagePopoutOpen,
    setIsImagePopoutOpen
  ]);
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

const navItems = [
  { page: 'home', path: '/', label: 'Home' },
  { page: 'monsters', path: '/monsters', label: 'Monsters' },
  { page: 'npcs', path: '/npcs', label: 'NPCs' },
  { page: 'spells', path: '/spells', label: 'Spells' },
  { page: 'feats', path: '/feats', label: 'Feats' },
  { page: 'equipment', path: '/equipment', label: 'Equipment' }
];

function NavBar({ currentPage, onNavigate, className = '' }) {
  return (
    <nav className={`navBar ${className}`.trim()} aria-label="Primary">
      {navItems.map(item => (
        <button
          key={item.page}
          className={`layoutButton${item.page === currentPage ? ' navActive' : ''}`}
          onClick={() => onNavigate(item.path)}
          disabled={item.page === currentPage}
          aria-current={item.page === currentPage ? 'page' : undefined}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function getCurrentPage() {
  const path = window.location.pathname.toLowerCase();
  if (path === '/equipment') return 'equipment';
  if (path === '/feats') return 'feats';
  if (path === '/spells') return 'spells';
  if (path === '/monsters') return 'monsters';
  if (path === '/npcs') return 'npcs';
  if (path === '/updates') return 'updates';
  return 'home';
}

function App() {
  const [page, setPage] = useState(getCurrentPage);

  useEffect(() => {
    function handlePopState() {
      setPage(getCurrentPage());
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function navigate(path) {
    window.history.pushState(null, '', path);
    setPage(getCurrentPage());
  }

  if (page === 'monsters') {
    return <MonsterSearchPage onNavigate={navigate} />;
  }

  if (page === 'npcs') {
    return <NpcSearchPage onNavigate={navigate} />;
  }

  if (page === 'spells') {
    return <SpellsPage onNavigate={navigate} />;
  }

  if (page === 'feats') {
    return <FeatsPage onNavigate={navigate} />;
  }

  if (page === 'equipment') {
    return <EquipmentPage onNavigate={navigate} />;
  }

  if (page === 'updates') {
    return <UpdatesPage onNavigate={navigate} />;
  }

  return <HomePage onNavigate={navigate} />;
}

function HomePage({ onNavigate }) {
  return (
    <div className="app homePage">
      <main className="homeShell">
        <div>
          <h1>PF2 Search</h1>
          <p>Choose a library to explore.</p>
        </div>

        <div className="homeActions">
          <button className="homeButton primary" onClick={() => onNavigate('/monsters')}>
            <Search size={22} /> Monsters
          </button>
          <button className="homeButton" onClick={() => onNavigate('/npcs')}>
            <UserRound size={22} /> NPCs
          </button>
          <button className="homeButton" onClick={() => onNavigate('/spells')}>
            <BookOpen size={22} /> Spells
          </button>
          <button className="homeButton" onClick={() => onNavigate('/feats')}>
            <Award size={22} /> Feats
          </button>
          <button className="homeButton" onClick={() => onNavigate('/equipment')}>
            <Package size={22} /> Equipment
          </button>
        </div>

        <div className="homeSecondaryActions">
          <button className="homeUpdatesButton" onClick={() => onNavigate('/updates')}>
            Updates
          </button>
        </div>
      </main>
    </div>
  );
}

function UpdatesPage({ onNavigate }) {
  const [webEntries, setWebEntries] = useState([]);
  const [utilitiesEntries, setUtilitiesEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    fetch('/updates.json')
      .then((response) => {
        if (!response.ok) throw new Error('Could not load updates log.');
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;

        const legacyEntries = Array.isArray(data.entries) ? data.entries : [];
        setWebEntries(Array.isArray(data.web?.entries) ? data.web.entries : legacyEntries);
        setUtilitiesEntries(Array.isArray(data.utilities?.entries) ? data.utilities.entries : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const groupedWebEntries = useMemo(() => groupUpdateEntries(webEntries), [webEntries]);
  const groupedUtilitiesEntries = useMemo(
    () => groupUpdateEntries(utilitiesEntries),
    [utilitiesEntries]
  );

  return (
    <div className="app updatesPage">
      <header className="updatesTopbar">
        <button className="updatesHomeButton" onClick={() => onNavigate('/')}>Home</button>
      </header>

      <main className="updatesShell">
        <div className="updatesIntro">
          <h1>Updates</h1>
          <p>Development logs for PF2 Search and Pathfinder Utilities.</p>
        </div>

        {loading && <p className="updatesStatus">Loading updates…</p>}
        {error && <p className="updatesStatus updatesError">{error}</p>}

        {!loading && !error && (
          <div className="updatesSplit">
            <UpdatesLogPanel
              title="PF2 Search (Web)"
              description={webUpdatesDescription}
              groupedEntries={groupedWebEntries}
              emptyMessage="No web updates recorded yet."
            />
            <UpdatesLogPanel
              title="Pathfinder Utilities"
              description={utilitiesUpdatesDescription}
              groupedEntries={groupedUtilitiesEntries}
              emptyMessage="No utilities updates recorded yet."
            />
          </div>
        )}
      </main>
    </div>
  );
}

function groupUpdateEntries(entries) {
  const groups = new Map();

  for (const entry of entries) {
    if (!groups.has(entry.date)) groups.set(entry.date, []);
    groups.get(entry.date).push(entry.comment);
  }

  return [...groups.entries()].sort(([leftDate], [rightDate]) => rightDate.localeCompare(leftDate));
}

function formatUpdateDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function UpdatesLogPanel({ title, description = [], groupedEntries, emptyMessage }) {
  return (
    <section className="updatesPane">
      <div className="updatesPaneHeader">
        <h2>{title}</h2>
        <div className="updatesPaneDescription">
          {description.map((paragraph) => (
            <p key={paragraph.slice(0, 48)}>{paragraph}</p>
          ))}
        </div>
      </div>

      {groupedEntries.length === 0 ? (
        <p className="updatesStatus">{emptyMessage}</p>
      ) : (
        <div className="updatesLog">
          {groupedEntries.map(([date, comments]) => (
            <section className="updatesDay" key={date}>
              <h3>{formatUpdateDate(date)}</h3>
              <ul>
                {comments.map((comment) => (
                  <li key={`${date}-${comment}`}>{comment}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function SpellsPage({ onNavigate }) {
  const [filters, setFilters] = useState(emptySpellFilters);
  const [lookups, setLookups] = useState({ rarity: [], sourceBook: [], tradition: [], trait: [] });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState('Name');
  const [sortDir, setSortDir] = useState('asc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [selectedSpell, setSelectedSpell] = useState(null);
  const searchRef = useRef(null);

  const limit = useMemo(() => Math.min(Math.max(Number(filters.limit || 100), 1), 500), [filters.limit]);

  function setFilter(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  async function fetchLookups() {
    const res = await fetch('/api/spell-lookups');
    if (!res.ok) throw new Error(await res.text());
    setLookups(await res.json());
  }

  async function search(newOffset = 0) {
    setLoading(true);
    setError('');
    try {
      const qs = buildQuery(filters, newOffset, sortBy, sortDir);
      const res = await fetch(`/api/spells?${qs}`);
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

  searchRef.current = search;

  useEffect(() => {
    fetchLookups().catch(err => setError(err.message || String(err)));
  }, []);

  useEffect(() => {
    function handleEnterSearch(event) {
      if (event.key !== 'Enter') return;

      event.preventDefault();
      searchRef.current?.(0);
    }

    document.addEventListener('keydown', handleEnterSearch);
    return () => document.removeEventListener('keydown', handleEnterSearch);
  }, []);

  useEffect(() => {
    search(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortDir]);

  function reset() {
    setFilters(emptySpellFilters);
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

  const handleModalRowChange = useCallback((row) => {
    setSelectedSpell(row);
    setSelected(row);
  }, []);

  const handleGridRowChange = useCallback((row) => {
    setSelected(row);
  }, []);

  useModalRowNavigation({
    rows,
    activeRecord: selectedSpell,
    idField: 'SpellId',
    onChange: handleModalRowChange
  });

  useGridRowNavigation({
    rows,
    selected,
    idField: 'SpellId',
    onChange: handleGridRowChange,
    enabled: !selectedSpell
  });

  return (
    <>
    <div className="app">
      <header className="topbar">
        <div>
          <h1>PF2 Spell Search</h1>
          <p>Search normalized spell data from `pf2.Spell` and related tables.</p>
        </div>
        <NavBar currentPage="spells" onNavigate={onNavigate} />
      </header>

      <main className="split splitRight">
        <aside className="searchPanel">
          <div className="panelTitle"><BookOpen size={18} /> Spell Fields</div>

          <div className="fieldGrid">
            <Field label="Name"><TextInput value={filters.name} onChange={v => setFilter('name', v)} placeholder="heal, fireball..." /></Field>
            <Field label="Text"><TextInput value={filters.text} onChange={v => setFilter('text', v)} placeholder="damage, aura..." /></Field>

            <Field label="Rank min"><TextInput value={filters.rankMin} onChange={v => setFilter('rankMin', v)} /></Field>
            <Field label="Rank max"><TextInput value={filters.rankMax} onChange={v => setFilter('rankMax', v)} /></Field>

            <Field label="Type"><TextInput value={filters.spellType} onChange={v => setFilter('spellType', v)} placeholder="Spell, Cantrip..." /></Field>
            <Field label="Actions"><TextInput value={filters.actions} onChange={v => setFilter('actions', v)} placeholder="1, 2, reaction..." /></Field>

            <Field label="Rarity"><SelectInput value={filters.rarity} onChange={v => setFilter('rarity', v)} options={lookups.rarity} /></Field>
            <Field label="Tradition"><SelectInput value={filters.tradition} onChange={v => setFilter('tradition', v)} options={lookups.tradition} /></Field>
            <Field label="Trait"><SelectInput value={filters.trait} onChange={v => setFilter('trait', v)} options={lookups.trait} /></Field>
            <Field label="Source"><TextInput value={filters.sourceBook} onChange={v => setFilter('sourceBook', v)} placeholder="Player Core" /></Field>

            <Field label="Defense"><TextInput value={filters.defense} onChange={v => setFilter('defense', v)} /></Field>
            <Field label="Duration"><TextInput value={filters.duration} onChange={v => setFilter('duration', v)} /></Field>
            <Field label="Limit"><TextInput value={filters.limit} onChange={v => setFilter('limit', v)} /></Field>
          </div>

          <div className="actions">
            <button className="primary" onClick={() => search(0)} disabled={loading}><Search size={16} /> Search</button>
            <button onClick={reset} disabled={loading}><RotateCcw size={16} /> Reset</button>
          </div>

          {selected && <SpellDetailCard spell={selected} />}
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
                  {spellColumns.map(([key, label]) => (
                    <th key={key} onClick={() => changeSort(key)}>
                      {label}
                      {sortBy === key ? (sortDir === 'asc' ? ' ^' : ' v') : ''}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.map(row => (
                  <tr
                    key={row.SpellId}
                    data-row-id={row.SpellId}
                    onClick={() => setSelected(row)}
                    onDoubleClick={() => setSelectedSpell(row)}
                    className={selected?.SpellId === row.SpellId ? 'selected' : ''}
                    title="Double-click to open full spell details"
                  >
                    {spellColumns.map(([key]) => (
                      <td key={key} title={row[key] ?? ''}>
                        {String(row[key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}

                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={spellColumns.length} className="empty">
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

    {selectedSpell && (
      <SpellModal
        spell={selectedSpell}
        onClose={() => setSelectedSpell(null)}
      />
    )}
  </>
  );
}

function FeatsPage({ onNavigate }) {
  const [filters, setFilters] = useState(emptyFeatFilters);
  const [lookups, setLookups] = useState({ rarity: [], sourceBook: [], trait: [] });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState('Name');
  const [sortDir, setSortDir] = useState('asc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [selectedFeat, setSelectedFeat] = useState(null);
  const searchRef = useRef(null);

  const limit = useMemo(() => Math.min(Math.max(Number(filters.limit || 100), 1), 500), [filters.limit]);

  function setFilter(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  async function fetchLookups() {
    const res = await fetch('/api/feat-lookups');
    if (!res.ok) throw new Error(await res.text());
    setLookups(await res.json());
  }

  async function search(newOffset = 0) {
    setLoading(true);
    setError('');
    try {
      const qs = buildQuery(filters, newOffset, sortBy, sortDir);
      const res = await fetch(`/api/feats?${qs}`);
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

  searchRef.current = search;

  useEffect(() => {
    fetchLookups().catch(err => setError(err.message || String(err)));
  }, []);

  useEffect(() => {
    function handleEnterSearch(event) {
      if (event.key !== 'Enter') return;

      event.preventDefault();
      searchRef.current?.(0);
    }

    document.addEventListener('keydown', handleEnterSearch);
    return () => document.removeEventListener('keydown', handleEnterSearch);
  }, []);

  useEffect(() => {
    search(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortDir]);

  function reset() {
    setFilters(emptyFeatFilters);
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

  const handleModalRowChange = useCallback((row) => {
    setSelectedFeat(row);
    setSelected(row);
  }, []);

  const handleGridRowChange = useCallback((row) => {
    setSelected(row);
  }, []);

  useModalRowNavigation({
    rows,
    activeRecord: selectedFeat,
    idField: 'FeatId',
    onChange: handleModalRowChange
  });

  useGridRowNavigation({
    rows,
    selected,
    idField: 'FeatId',
    onChange: handleGridRowChange,
    enabled: !selectedFeat
  });

  return (
    <>
    <div className="app">
      <header className="topbar">
        <div>
          <h1>PF2 Feat Search</h1>
          <p>Search normalized feat data from `pf2.Feat` and related tables.</p>
        </div>
        <NavBar currentPage="feats" onNavigate={onNavigate} />
      </header>

      <main className="split splitRight">
        <aside className="searchPanel">
          <div className="panelTitle"><Award size={18} /> Feat Fields</div>

          <div className="fieldGrid">
            <Field label="Name"><TextInput value={filters.name} onChange={v => setFilter('name', v)} placeholder="power attack..." /></Field>
            <Field label="Text"><TextInput value={filters.text} onChange={v => setFilter('text', v)} placeholder="stance, shield..." /></Field>

            <Field label="Level min"><TextInput value={filters.levelMin} onChange={v => setFilter('levelMin', v)} /></Field>
            <Field label="Level max"><TextInput value={filters.levelMax} onChange={v => setFilter('levelMax', v)} /></Field>

            <Field label="Type"><TextInput value={filters.featType} onChange={v => setFilter('featType', v)} placeholder="Class, Skill..." /></Field>
            <Field label="PFS"><TextInput value={filters.pfs} onChange={v => setFilter('pfs', v)} placeholder="Standard, Limited..." /></Field>

            <Field label="Rarity"><SelectInput value={filters.rarity} onChange={v => setFilter('rarity', v)} options={lookups.rarity} /></Field>
            <Field label="Trait"><SelectInput value={filters.trait} onChange={v => setFilter('trait', v)} options={lookups.trait} /></Field>
            <Field label="Source"><TextInput value={filters.sourceBook} onChange={v => setFilter('sourceBook', v)} placeholder="Player Core" /></Field>
            <Field label="Std ancestry"><BoolSelect value={filters.isStandardAncestryFeat} onChange={v => setFilter('isStandardAncestryFeat', v)} /></Field>
            <Field label="Limit"><TextInput value={filters.limit} onChange={v => setFilter('limit', v)} /></Field>
          </div>

          <div className="actions">
            <button className="primary" onClick={() => search(0)} disabled={loading}><Search size={16} /> Search</button>
            <button onClick={reset} disabled={loading}><RotateCcw size={16} /> Reset</button>
          </div>

          {selected && <FeatDetailCard feat={selected} />}
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
                  {featColumns.map(([key, label]) => (
                    <th key={key} onClick={() => changeSort(key)}>
                      {label}
                      {sortBy === key ? (sortDir === 'asc' ? ' ^' : ' v') : ''}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.map(row => (
                  <tr
                    key={row.FeatId}
                    data-row-id={row.FeatId}
                    onClick={() => setSelected(row)}
                    onDoubleClick={() => setSelectedFeat(row)}
                    className={selected?.FeatId === row.FeatId ? 'selected' : ''}
                    title="Double-click to open full feat details"
                  >
                    {featColumns.map(([key]) => (
                      <td key={key} title={row[key] ?? ''}>
                        {key === 'IsStandardAncestryFeat'
                          ? (row[key] ? 'Yes' : 'No')
                          : String(row[key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}

                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={featColumns.length} className="empty">
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

    {selectedFeat && (
      <FeatModal
        feat={selectedFeat}
        onClose={() => setSelectedFeat(null)}
      />
    )}
  </>
  );
}

function EquipmentPage({ onNavigate }) {
  const [filters, setFilters] = useState(emptyEquipmentFilters);
  const [lookups, setLookups] = useState({ rarity: [], sourceBook: [], trait: [] });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState('Name');
  const [sortDir, setSortDir] = useState('asc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const searchRef = useRef(null);

  const limit = useMemo(() => Math.min(Math.max(Number(filters.limit || 100), 1), 500), [filters.limit]);

  function setFilter(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  async function fetchLookups() {
    const res = await fetch('/api/equipment-lookups');
    if (!res.ok) throw new Error(await res.text());
    setLookups(await res.json());
  }

  async function search(newOffset = 0) {
    setLoading(true);
    setError('');
    try {
      const qs = buildQuery(filters, newOffset, sortBy, sortDir);
      const res = await fetch(`/api/equipment?${qs}`);
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

  searchRef.current = search;

  useEffect(() => {
    fetchLookups().catch(err => setError(err.message || String(err)));
  }, []);

  useEffect(() => {
    function handleEnterSearch(event) {
      if (event.key !== 'Enter') return;

      event.preventDefault();
      searchRef.current?.(0);
    }

    document.addEventListener('keydown', handleEnterSearch);
    return () => document.removeEventListener('keydown', handleEnterSearch);
  }, []);

  useEffect(() => {
    search(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortDir]);

  function reset() {
    setFilters(emptyEquipmentFilters);
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

  const handleModalRowChange = useCallback((row) => {
    setSelectedEquipment(row);
    setSelected(row);
  }, []);

  const handleGridRowChange = useCallback((row) => {
    setSelected(row);
  }, []);

  useModalRowNavigation({
    rows,
    activeRecord: selectedEquipment,
    idField: 'EquipmentId',
    onChange: handleModalRowChange
  });

  useGridRowNavigation({
    rows,
    selected,
    idField: 'EquipmentId',
    onChange: handleGridRowChange,
    enabled: !selectedEquipment
  });

  return (
    <>
    <div className="app">
      <header className="topbar">
        <div>
          <h1>PF2 Equipment Search</h1>
          <p>Search normalized equipment data from `pf2.Equipment` and related tables.</p>
        </div>
        <NavBar currentPage="equipment" onNavigate={onNavigate} />
      </header>

      <main className="split splitRight">
        <aside className="searchPanel">
          <div className="panelTitle"><Package size={18} /> Equipment Fields</div>

          <div className="fieldGrid">
            <Field label="Name"><TextInput value={filters.name} onChange={v => setFilter('name', v)} placeholder="longsword, potion..." /></Field>
            <Field label="Text"><TextInput value={filters.text} onChange={v => setFilter('text', v)} placeholder="healing, fire..." /></Field>

            <Field label="Level min"><TextInput value={filters.levelMin} onChange={v => setFilter('levelMin', v)} /></Field>
            <Field label="Level max"><TextInput value={filters.levelMax} onChange={v => setFilter('levelMax', v)} /></Field>

            <Field label="Type"><TextInput value={filters.equipmentType} onChange={v => setFilter('equipmentType', v)} placeholder="Item, Weapon..." /></Field>
            <Field label="Search category"><TextInput value={filters.searchCategory} onChange={v => setFilter('searchCategory', v)} /></Field>
            <Field label="Category"><TextInput value={filters.itemCategory} onChange={v => setFilter('itemCategory', v)} /></Field>
            <Field label="Subcategory"><TextInput value={filters.itemSubcategory} onChange={v => setFilter('itemSubcategory', v)} /></Field>

            <Field label="Rarity"><SelectInput value={filters.rarity} onChange={v => setFilter('rarity', v)} options={lookups.rarity} /></Field>
            <Field label="Trait"><SelectInput value={filters.trait} onChange={v => setFilter('trait', v)} options={lookups.trait} /></Field>
            <Field label="Source"><TextInput value={filters.sourceBook} onChange={v => setFilter('sourceBook', v)} placeholder="Player Core" /></Field>
            <Field label="PFS"><TextInput value={filters.pfs} onChange={v => setFilter('pfs', v)} /></Field>

            <Field label="Price text"><TextInput value={filters.price} onChange={v => setFilter('price', v)} /></Field>
            <Field label="Bulk"><TextInput value={filters.bulk} onChange={v => setFilter('bulk', v)} /></Field>
            <Field label="Price min cp"><TextInput value={filters.priceMin} onChange={v => setFilter('priceMin', v)} /></Field>
            <Field label="Price max cp"><TextInput value={filters.priceMax} onChange={v => setFilter('priceMax', v)} /></Field>

            <Field label="Weapon category"><TextInput value={filters.weaponCategory} onChange={v => setFilter('weaponCategory', v)} /></Field>
            <Field label="Weapon group"><TextInput value={filters.weaponGroup} onChange={v => setFilter('weaponGroup', v)} /></Field>
            <Field label="Weapon type"><TextInput value={filters.weaponType} onChange={v => setFilter('weaponType', v)} /></Field>
            <Field label="Damage type"><TextInput value={filters.damageType} onChange={v => setFilter('damageType', v)} /></Field>
            <Field label="Armor category"><TextInput value={filters.armorCategory} onChange={v => setFilter('armorCategory', v)} /></Field>
            <Field label="Limit"><TextInput value={filters.limit} onChange={v => setFilter('limit', v)} /></Field>
          </div>

          <div className="actions">
            <button className="primary" onClick={() => search(0)} disabled={loading}><Search size={16} /> Search</button>
            <button onClick={reset} disabled={loading}><RotateCcw size={16} /> Reset</button>
          </div>

          {selected && <EquipmentDetailCard item={selected} />}
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
                  {equipmentColumns.map(([key, label]) => (
                    <th key={key} onClick={() => changeSort(key)}>
                      {label}
                      {sortBy === key ? (sortDir === 'asc' ? ' ^' : ' v') : ''}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.map(row => (
                  <tr
                    key={row.EquipmentId}
                    data-row-id={row.EquipmentId}
                    onClick={() => setSelected(row)}
                    onDoubleClick={() => setSelectedEquipment(row)}
                    className={selected?.EquipmentId === row.EquipmentId ? 'selected' : ''}
                    title="Double-click to open full equipment details"
                  >
                    {equipmentColumns.map(([key]) => (
                      <td key={key} title={row[key] ?? ''}>
                        {String(row[key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}

                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={equipmentColumns.length} className="empty">
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

    {selectedEquipment && (
      <EquipmentModal
        item={selectedEquipment}
        onClose={() => setSelectedEquipment(null)}
      />
    )}
  </>
  );
}

function CreatureSearchPage({
  onNavigate,
  currentPage,
  apiPath,
  title,
  subtitle,
  detailTitle = 'Double-click to open full details'
}) {
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
  // Grid layout toggle (right/below) — disabled for now
  // const [layout, setLayout] = useState('right');
  const searchRef = useRef(null);


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
      const res = await fetch(`/api/${apiPath}?${qs}`);
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

  searchRef.current = search;

  useEffect(() => {
    fetchLookups().catch(err => setError(err.message || String(err)));
  }, []);

  useEffect(() => {
    function handleEnterSearch(event) {
      if (event.key !== 'Enter') return;

      event.preventDefault();
      searchRef.current?.(0);
    }

    document.addEventListener('keydown', handleEnterSearch);
    return () => document.removeEventListener('keydown', handleEnterSearch);
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

  const handleModalRowChange = useCallback((row) => {
    setSelectedMonster(row);
    setSelected(row);
  }, []);

  const handleGridRowChange = useCallback((row) => {
    setSelected(row);
  }, []);

  useModalRowNavigation({
    rows,
    activeRecord: selectedMonster,
    idField: 'MonsterId',
    onChange: handleModalRowChange
  });

  useGridRowNavigation({
    rows,
    selected,
    idField: 'MonsterId',
    onChange: handleGridRowChange,
    enabled: !selectedMonster
  });

  return (
    <>
    <div className="app">
      <header className="topbar">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="topbarActions">
          <NavBar currentPage={currentPage} onNavigate={onNavigate} />
          {/*
          <button className="layoutButton" onClick={() => setLayout(layout === 'right' ? 'below' : 'right')}>
            <Columns3 size={16} /> Grid {layout === 'right' ? 'right' : 'below'}
          </button>
          */}
        </div>
      </header>

      <main className="split splitRight">
        {/* was: layout === 'right' ? 'split splitRight' : 'split splitBelow' */}
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
                    data-row-id={row.MonsterId}
                    onClick={() => setSelected(row)}
                    onDoubleClick={() => setSelectedMonster(row)}
                    className={selected?.MonsterId === row.MonsterId ? 'selected' : ''}
                    title={detailTitle}
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

function MonsterSearchPage(props) {
  return (
    <CreatureSearchPage
      {...props}
      currentPage="monsters"
      apiPath="monsters"
      title="PF2 Monster Search"
      subtitle="Search pf2.vwMonsterFull for creatures, excluding NPCs."
      detailTitle="Double-click to open full monster details"
    />
  );
}

function NpcSearchPage(props) {
  return (
    <CreatureSearchPage
      {...props}
      currentPage="npcs"
      apiPath="npcs"
      title="PF2 NPC Search"
      subtitle="Search pf2.vwMonsterFull for NPCs."
      detailTitle="Double-click to open full NPC details"
    />
  );
}

function FeatDetailCard({ feat }) {
  return (
    <div className="detailCard">
      <div className="detailTop">
        <div className="noArt"><Award /></div>
        <div>
          <h2>{feat.Name}</h2>
          <div className="muted">Level {feat.Level ?? '?'} {feat.FeatType || ''} {feat.Rarity || ''}</div>
          <div className="chips">
            {feat.Traits && <span>{feat.Traits}</span>}
            {feat.SourceBook && <span>{feat.SourceBook}</span>}
            {feat.PFS && <span>{feat.PFS}</span>}
            {feat.IsStandardAncestryFeat && <span>Standard ancestry</span>}
          </div>
          {feat.AonUrl && <a href={feat.AonUrl} target="_blank" rel="noreferrer">Open AoN <ExternalLink size={13} /></a>}
        </div>
      </div>
      <div className="detailBlock"><b>Summary</b><p>{feat.Summary || '-'}</p></div>
      <div className="detailBlock"><b>Source</b><p>{feat.SourceBook || '-'} {feat.SourcePage ? `pg. ${feat.SourcePage}` : ''}</p></div>
    </div>
  );
}

function EquipmentDetailCard({ item }) {
  return (
    <div className="detailCard">
      <div className="detailTop">
        <div className="noArt"><Package /></div>
        <div>
          <h2>{item.Name}</h2>
          <div className="muted">Level {item.Level ?? '?'} {item.EquipmentType || ''} {item.Rarity || ''}</div>
          <div className="chips">
            {item.Traits && <span>{item.Traits}</span>}
            {item.ItemCategory && <span>{item.ItemCategory}</span>}
            {item.SourceBook && <span>{item.SourceBook}</span>}
          </div>
          {item.AonUrl && <a href={item.AonUrl} target="_blank" rel="noreferrer">Open AoN <ExternalLink size={13} /></a>}
        </div>
      </div>
      <div className="statLine">
        <b>Price</b> {item.PriceText || '-'} <b>Bulk</b> {item.BulkText || '-'}
      </div>
      <div className="statLine">
        <b>Weapon</b> {item.WeaponCategory || '-'} <b>Armor</b> {item.ArmorCategory || '-'}
      </div>
      <div className="detailBlock"><b>Summary</b><p>{item.Summary || '-'}</p></div>
      <div className="detailBlock"><b>Source</b><p>{item.SourceBook || '-'} {item.SourcePage ? `pg. ${item.SourcePage}` : ''}</p></div>
    </div>
  );
}

function SpellDetailCard({ spell }) {
  return (
    <div className="detailCard">
      <div className="detailTop">
        <div className="noArt"><BookOpen /></div>
        <div>
          <h2>{spell.Name}</h2>
          <div className="muted">Rank {spell.Rank ?? '?'} {spell.SpellType || ''} {spell.Rarity || ''}</div>
          <div className="chips">
            {spell.Traditions && <span>{spell.Traditions}</span>}
            {spell.Traits && <span>{spell.Traits}</span>}
            {spell.SourceBook && <span>{spell.SourceBook}</span>}
          </div>
          {spell.AonUrl && <a href={spell.AonUrl} target="_blank" rel="noreferrer">Open AoN <ExternalLink size={13} /></a>}
        </div>
      </div>
      <div className="statLine">
        <b>Actions</b> {spell.Actions || '-'} <b>Defense</b> {spell.Defense || '-'}
      </div>
      <div className="statLine">
        <b>Range</b> {spell.RangeText || '-'} <b>Area</b> {spell.Area || '-'} <b>Duration</b> {spell.Duration || '-'}
      </div>
      <div className="detailBlock"><b>Summary</b><p>{spell.Summary || '-'}</p></div>
      <div className="detailBlock"><b>Heighten</b><p>{spell.Heighten || '-'}</p></div>
      <div className="detailBlock"><b>Source</b><p>{spell.SourceBook || '-'} {spell.SourcePage ? `pg. ${spell.SourcePage}` : ''}</p></div>
    </div>
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

function getCaseInsensitiveField(record, fieldName) {
  const target = fieldName.toLowerCase();
  const entry = Object.entries(record).find(([key]) => key.toLowerCase() === target);
  return entry ? entry[1] : undefined;
}

const localMarkdownRoutes = new Set([
  '/',
  '/monsters',
  '/npcs',
  '/spells',
  '/feats',
  '/equipment'
]);

function isSupportedMarkdownHref(href) {
  if (!href) return false;

  try {
    const url = new URL(href, window.location.origin);

    if (url.origin !== window.location.origin) {
      return url.protocol === 'http:' || url.protocol === 'https:';
    }

    return localMarkdownRoutes.has(url.pathname.toLowerCase());
  } catch {
    return false;
  }
}

function MarkdownLink({ href, children }) {
  if (!isSupportedMarkdownHref(href)) {
    return <span>{children}</span>;
  }

  const url = new URL(href, window.location.origin);
  const isExternal = url.origin !== window.location.origin;

  return (
    <a
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noreferrer' : undefined}
    >
      {children}
    </a>
  );
}

function MarkdownViewer({ rawMD, className = '' }) {
  return (
    <div className={`modal-md ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: MarkdownLink }}
      >
        {rawMD}
      </ReactMarkdown>
    </div>
  );
}

function MarkdownPopoutModal({ label = 'MD', rawMD, onClose }) {
  return (
    <div className="md-popout-backdrop" onClick={onClose}>
      <div className="md-popout-modal" onClick={(e) => e.stopPropagation()}>
        <div className="md-popout-header">
          <span>{label}</span>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>

        <MarkdownViewer rawMD={rawMD} className="modal-md-popout" />
      </div>
    </div>
  );
}

function getImagePopoutDisplaySize(naturalSize, viewport) {
  const verticalMargin = 48;
  const horizontalMargin = 44;
  const chromeHeight = 90;
  const modalHorizontalPadding = 32;

  const maxWidth = viewport.width - horizontalMargin - modalHorizontalPadding;
  const maxHeight = viewport.height - (verticalMargin * 2) - chromeHeight;
  const widthScale = maxWidth / naturalSize.width;
  const heightScale = maxHeight / naturalSize.height;
  const scale = Math.min(1, widthScale, heightScale);

  return {
    width: Math.round(naturalSize.width * scale),
    height: Math.round(naturalSize.height * scale)
  };
}

function ImagePopoutModal({ imageUrl, alt = 'Art', onClose }) {
  const [naturalSize, setNaturalSize] = useState(null);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }));

  useEffect(() => {
    function handleResize() {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight
      });
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();

    img.onload = () => {
      if (!cancelled) {
        setNaturalSize({
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      }
    };

    img.onerror = () => {
      if (!cancelled) setNaturalSize(null);
    };

    img.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const displaySize = useMemo(() => (
    naturalSize ? getImagePopoutDisplaySize(naturalSize, viewport) : null
  ), [naturalSize, viewport]);

  const dimensionLabel = naturalSize
    ? `${naturalSize.width} × ${naturalSize.height}`
    : 'Loading…';

  return (
    <div className="image-popout-backdrop" onClick={onClose}>
      <div className="image-popout-modal" onClick={(e) => e.stopPropagation()}>
        <div className="image-popout-header">
          <span>{dimensionLabel}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="image-popout-content">
          <img
            src={imageUrl}
            alt={alt}
            width={displaySize?.width}
            height={displaySize?.height}
            style={displaySize ? {
              width: displaySize.width,
              height: displaySize.height
            } : undefined}
          />
        </div>
      </div>
    </div>
  );
}

function renderModalValue(key, value) {
  if (value === null || value === undefined) return '';

  if (isUrlField(key, value)) {
    return (
      <a href={value} target="_blank" rel="noreferrer" className="modal-link">
        {value}
      </a>
    );
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  return String(value);
}

function splitEntityFields(record) {
  const rawMD = getCaseInsensitiveField(record, 'RawMD') ?? '';
  const normalFields = Object.entries(record).filter(([key]) => !isRawField(key));
  const rawFields = Object.entries(record).filter(([key]) => (
    isRawField(key) && key.toLowerCase() !== 'rawmd'
  ));

  return { rawMD, normalFields, rawFields };
}

function ModalArt({ imageUrl, alt, fallbackIcon, onImageOpen }) {
  if (imageUrl) {
    return (
      <img
        className="modal-image modal-image-clickable"
        src={imageUrl}
        alt={alt}
        title="Double-click to view full size"
        onDoubleClick={(e) => {
          e.stopPropagation();
          onImageOpen();
        }}
      />
    );
  }

  return <div className="modal-no-art">{fallbackIcon}</div>;
}

function ModalDescriptionPanel({ descriptionMD, rawMD, onPopout }) {
  if (!descriptionMD) return null;

  return (
    <div className="modal-description-panel">
      <div className="modal-section-title-row">
        <h3>Description</h3>
        {rawMD && (
          <button className="modal-small-button" onClick={onPopout}>
            Pop out
          </button>
        )}
      </div>
      <MarkdownViewer rawMD={descriptionMD} className="modal-description-md" />
    </div>
  );
}

function ModalMdSection({ rawMD, onPopout }) {
  if (!rawMD) return null;

  return (
    <div className="modal-section">
      <div className="modal-section-title-row">
        <h3>MD</h3>
        <button className="modal-small-button" onClick={onPopout}>
          Pop out
        </button>
      </div>
      <MarkdownViewer rawMD={rawMD} />
    </div>
  );
}

function ModalAllFieldsSection({ title, normalFields }) {
  return (
    <div className="modal-section">
      <h3>{title}</h3>
      <div className="modal-field-grid">
        {normalFields.map(([key, value]) => (
          <div className="modal-field" key={key}>
            <div className="modal-field-label">{key}</div>
            <div className="modal-field-value">{renderModalValue(key, value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModalRawFieldsSection({ rawFields }) {
  if (rawFields.length === 0) return null;

  return (
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
  );
}

function ModalPopouts({
  rawMD,
  isMDPopoutOpen,
  onCloseMD,
  imageUrl,
  imageAlt,
  isImagePopoutOpen,
  onCloseImage
}) {
  return (
    <>
      {isMDPopoutOpen && (
        <MarkdownPopoutModal rawMD={rawMD} onClose={onCloseMD} />
      )}

      {isImagePopoutOpen && imageUrl && (
        <ImagePopoutModal imageUrl={imageUrl} alt={imageAlt} onClose={onCloseImage} />
      )}
    </>
  );
}

function MonsterModal({ monster, onClose }) {
  const [isMDPopoutOpen, setIsMDPopoutOpen] = useState(false);
  const [isImagePopoutOpen, setIsImagePopoutOpen] = useState(false);
  const modalRef = useRef(null);
  const { rawMD, normalFields, rawFields } = splitEntityFields(monster);
  const descriptionMD = useMemo(() => extractMarkdownDescriptionMonster(rawMD), [rawMD]);
  const imageUrl = getCaseInsensitiveField(monster, 'ImageUrl') ?? '';

  useEffect(() => {
    setIsMDPopoutOpen(false);
    setIsImagePopoutOpen(false);
    modalRef.current?.scrollTo(0, 0);
  }, [monster.MonsterId]);

  useModalEscape({
    onClose,
    isMDPopoutOpen,
    setIsMDPopoutOpen,
    isImagePopoutOpen,
    setIsImagePopoutOpen
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="monster-modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>

        <div className="modal-top-row">
          <div className="modal-header">
            <ModalArt
              imageUrl={imageUrl}
              alt={monster.Name}
              fallbackIcon={<ImageIcon />}
              onImageOpen={() => setIsImagePopoutOpen(true)}
            />

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

          <ModalDescriptionPanel
            descriptionMD={descriptionMD}
            rawMD={rawMD}
            onPopout={() => setIsMDPopoutOpen(true)}
          />
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

        <ModalAllFieldsSection title="All Monster Fields" normalFields={normalFields} />
        <ModalMdSection rawMD={rawMD} onPopout={() => setIsMDPopoutOpen(true)} />
        <ModalRawFieldsSection rawFields={rawFields} />

        <ModalPopouts
          rawMD={rawMD}
          isMDPopoutOpen={isMDPopoutOpen}
          onCloseMD={() => setIsMDPopoutOpen(false)}
          imageUrl={imageUrl}
          imageAlt={monster.Name}
          isImagePopoutOpen={isImagePopoutOpen}
          onCloseImage={() => setIsImagePopoutOpen(false)}
        />
      </div>
    </div>
  );
}

function SpellModal({ spell, onClose }) {
  const [isMDPopoutOpen, setIsMDPopoutOpen] = useState(false);
  const [isImagePopoutOpen, setIsImagePopoutOpen] = useState(false);
  const modalRef = useRef(null);
  const { rawMD, normalFields, rawFields } = splitEntityFields(spell);
  const { descriptionMD, bodyMD } = useMemo(() => {
    const description = extractMarkdownDescriptionFeatsEquipSpells(rawMD);
    return {
      descriptionMD: description,
      bodyMD: description ? extractMarkdownRemainderFeatsEquipSpells(rawMD) : rawMD
    };
  }, [rawMD]);
  const imageUrl = getCaseInsensitiveField(spell, 'ImageUrl') ?? '';

  useEffect(() => {
    setIsMDPopoutOpen(false);
    setIsImagePopoutOpen(false);
    modalRef.current?.scrollTo(0, 0);
  }, [spell.SpellId]);

  useModalEscape({
    onClose,
    isMDPopoutOpen,
    setIsMDPopoutOpen,
    isImagePopoutOpen,
    setIsImagePopoutOpen
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="monster-modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>

        <div className="modal-top-row">
          <div className="modal-header">
            <ModalArt
              imageUrl={imageUrl}
              alt={spell.Name}
              fallbackIcon={<BookOpen />}
              onImageOpen={() => setIsImagePopoutOpen(true)}
            />

            <div>
              <h2 className="modal-title">{spell.Name}</h2>
              <div className="modal-subtitle">
                Rank {spell.Rank ?? '?'} · {spell.SpellType || '-'} · {spell.Rarity || '-'}
              </div>

              <div className="modal-pill-row">
                {spell.Traditions && <span className="modal-pill">{spell.Traditions}</span>}
                {spell.Traits && <span className="modal-pill">{spell.Traits}</span>}
                {spell.SourceBook && <span className="modal-pill">{spell.SourceBook}</span>}
              </div>

              {spell.AonUrl && (
                <a className="modal-link" href={spell.AonUrl} target="_blank" rel="noreferrer">
                  Open AoN <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>

          <ModalDescriptionPanel
            descriptionMD={descriptionMD}
            rawMD={rawMD}
            onPopout={() => setIsMDPopoutOpen(true)}
          />
        </div>

        <div className="modal-section">
          <h3>Cast Details</h3>
          <div className="modal-stat-grid">
            {['Actions','Defense','RangeText','Area','Duration','PFS'].map((key) => (
              <div key={key} className="modal-stat">
                <span className="modal-stat-label">{key}</span>
                <span className="modal-stat-value">{spell[key] ?? '-'}</span>
              </div>
            ))}
          </div>
        </div>

        <ModalAllFieldsSection title="All Spell Fields" normalFields={normalFields} />
        <ModalMdSection rawMD={bodyMD} onPopout={() => setIsMDPopoutOpen(true)} />
        <ModalRawFieldsSection rawFields={rawFields} />

        <ModalPopouts
          rawMD={rawMD}
          isMDPopoutOpen={isMDPopoutOpen}
          onCloseMD={() => setIsMDPopoutOpen(false)}
          imageUrl={imageUrl}
          imageAlt={spell.Name}
          isImagePopoutOpen={isImagePopoutOpen}
          onCloseImage={() => setIsImagePopoutOpen(false)}
        />
      </div>
    </div>
  );
}

function FeatModal({ feat, onClose }) {
  const [isMDPopoutOpen, setIsMDPopoutOpen] = useState(false);
  const [isImagePopoutOpen, setIsImagePopoutOpen] = useState(false);
  const modalRef = useRef(null);
  const { rawMD, normalFields, rawFields } = splitEntityFields(feat);
  const { descriptionMD, bodyMD } = useMemo(() => {
    const description = extractMarkdownDescriptionFeatsEquipSpells(rawMD);
    return {
      descriptionMD: description,
      bodyMD: description ? extractMarkdownRemainderFeatsEquipSpells(rawMD) : rawMD
    };
  }, [rawMD]);
  const imageUrl = getCaseInsensitiveField(feat, 'ImageUrl') ?? '';

  useEffect(() => {
    setIsMDPopoutOpen(false);
    setIsImagePopoutOpen(false);
    modalRef.current?.scrollTo(0, 0);
  }, [feat.FeatId]);

  useModalEscape({
    onClose,
    isMDPopoutOpen,
    setIsMDPopoutOpen,
    isImagePopoutOpen,
    setIsImagePopoutOpen
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="monster-modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>

        <div className="modal-top-row">
          <div className="modal-header">
            <ModalArt
              imageUrl={imageUrl}
              alt={feat.Name}
              fallbackIcon={<Award />}
              onImageOpen={() => setIsImagePopoutOpen(true)}
            />

            <div>
              <h2 className="modal-title">{feat.Name}</h2>
              <div className="modal-subtitle">
                Level {feat.Level ?? '?'} · {feat.FeatType || '-'} · {feat.Rarity || '-'}
              </div>

              <div className="modal-pill-row">
                {feat.Traits && <span className="modal-pill">{feat.Traits}</span>}
                {feat.SourceBook && <span className="modal-pill">{feat.SourceBook}</span>}
                {feat.PFS && <span className="modal-pill">{feat.PFS}</span>}
                {feat.IsStandardAncestryFeat && <span className="modal-pill">Standard ancestry</span>}
              </div>

              {feat.AonUrl && (
                <a className="modal-link" href={feat.AonUrl} target="_blank" rel="noreferrer">
                  Open AoN <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>

          <ModalDescriptionPanel
            descriptionMD={descriptionMD}
            rawMD={rawMD}
            onPopout={() => setIsMDPopoutOpen(true)}
          />
        </div>

        <div className="modal-section">
          <h3>Feat Details</h3>
          <div className="modal-stat-grid">
            {['Level','FeatType','Rarity','PFS','SourceBook','SourcePage'].map((key) => (
              <div key={key} className="modal-stat">
                <span className="modal-stat-label">{key}</span>
                <span className="modal-stat-value">{renderModalValue(key, feat[key]) || '-'}</span>
              </div>
            ))}
          </div>
        </div>

        <ModalAllFieldsSection title="All Feat Fields" normalFields={normalFields} />
        <ModalMdSection rawMD={bodyMD} onPopout={() => setIsMDPopoutOpen(true)} />
        <ModalRawFieldsSection rawFields={rawFields} />

        <ModalPopouts
          rawMD={rawMD}
          isMDPopoutOpen={isMDPopoutOpen}
          onCloseMD={() => setIsMDPopoutOpen(false)}
          imageUrl={imageUrl}
          imageAlt={feat.Name}
          isImagePopoutOpen={isImagePopoutOpen}
          onCloseImage={() => setIsImagePopoutOpen(false)}
        />
      </div>
    </div>
  );
}

function EquipmentModal({ item, onClose }) {
  const [isMDPopoutOpen, setIsMDPopoutOpen] = useState(false);
  const [isImagePopoutOpen, setIsImagePopoutOpen] = useState(false);
  const modalRef = useRef(null);
  const { rawMD, normalFields, rawFields } = splitEntityFields(item);
  const { descriptionMD, bodyMD } = useMemo(() => {
    const description = extractMarkdownDescriptionFeatsEquipSpells(rawMD);
    return {
      descriptionMD: description,
      bodyMD: description ? extractMarkdownRemainderFeatsEquipSpells(rawMD) : rawMD
    };
  }, [rawMD]);
  const imageUrl = getCaseInsensitiveField(item, 'ImageUrl') ?? '';

  useEffect(() => {
    setIsMDPopoutOpen(false);
    setIsImagePopoutOpen(false);
    modalRef.current?.scrollTo(0, 0);
  }, [item.EquipmentId]);

  useModalEscape({
    onClose,
    isMDPopoutOpen,
    setIsMDPopoutOpen,
    isImagePopoutOpen,
    setIsImagePopoutOpen
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="monster-modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>

        <div className="modal-top-row">
          <div className="modal-header">
            <ModalArt
              imageUrl={imageUrl}
              alt={item.Name}
              fallbackIcon={<Package />}
              onImageOpen={() => setIsImagePopoutOpen(true)}
            />

            <div>
              <h2 className="modal-title">{item.Name}</h2>
              <div className="modal-subtitle">
                Level {item.Level ?? '?'} · {item.EquipmentType || '-'} · {item.Rarity || '-'}
              </div>

              <div className="modal-pill-row">
                {item.Traits && <span className="modal-pill">{item.Traits}</span>}
                {item.ItemCategory && <span className="modal-pill">{item.ItemCategory}</span>}
                {item.ItemSubcategory && <span className="modal-pill">{item.ItemSubcategory}</span>}
                {item.SourceBook && <span className="modal-pill">{item.SourceBook}</span>}
              </div>

              {item.AonUrl && (
                <a className="modal-link" href={item.AonUrl} target="_blank" rel="noreferrer">
                  Open AoN <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>

          <ModalDescriptionPanel
            descriptionMD={descriptionMD}
            rawMD={rawMD}
            onPopout={() => setIsMDPopoutOpen(true)}
          />
        </div>

        <div className="modal-section">
          <h3>Item Details</h3>
          <div className="modal-stat-grid">
            {['PriceText','BulkText','WeaponCategory','WeaponGroup','Damage','ArmorCategory','AC','Hardness','HP','PFS','SourceBook','SourcePage'].map((key) => (
              <div key={key} className="modal-stat">
                <span className="modal-stat-label">{key}</span>
                <span className="modal-stat-value">{item[key] ?? '-'}</span>
              </div>
            ))}
          </div>
        </div>

        <ModalAllFieldsSection title="All Equipment Fields" normalFields={normalFields} />
        <ModalMdSection rawMD={bodyMD} onPopout={() => setIsMDPopoutOpen(true)} />
        <ModalRawFieldsSection rawFields={rawFields} />

        <ModalPopouts
          rawMD={rawMD}
          isMDPopoutOpen={isMDPopoutOpen}
          onCloseMD={() => setIsMDPopoutOpen(false)}
          imageUrl={imageUrl}
          imageAlt={item.Name}
          isImagePopoutOpen={isImagePopoutOpen}
          onCloseImage={() => setIsImagePopoutOpen(false)}
        />
      </div>
    </div>
  );
}


createRoot(document.getElementById('root')).render(<App />);
