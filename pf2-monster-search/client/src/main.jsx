import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, RotateCcw, ExternalLink, Image as ImageIcon, Columns3, BookOpen, Award, Package } from 'lucide-react';
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
  { page: 'spells', path: '/spells', label: 'Spells' },
  { page: 'feats', path: '/feats', label: 'Feats' },
  { page: 'equipment', path: '/equipment', label: 'Equipment' }
];

function NavBar({ currentPage, onNavigate, className = '' }) {
  return (
    <nav className={`navBar ${className}`.trim()} aria-label="Primary">
      {navItems
        .filter(item => item.page !== currentPage)
        .map(item => (
          <button key={item.page} className="layoutButton" onClick={() => onNavigate(item.path)}>
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

  if (page === 'spells') {
    return <SpellsPage onNavigate={navigate} />;
  }

  if (page === 'feats') {
    return <FeatsPage onNavigate={navigate} />;
  }

  if (page === 'equipment') {
    return <EquipmentPage onNavigate={navigate} />;
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
      </main>
    </div>
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

function MonsterSearchPage({ onNavigate }) {
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

  return (
    <>
    <div className="app">
      <header className="topbar">
        <div>
          <h1>PF2 Monster Search</h1>
          <p>Search `pf2.vwMonsterFull` by creature fields and browse results.</p>
        </div>
        <div className="topbarActions">
          <NavBar currentPage="monsters" onNavigate={onNavigate} />
          <button className="layoutButton" onClick={() => setLayout(layout === 'right' ? 'below' : 'right')}>
            <Columns3 size={16} /> Grid {layout === 'right' ? 'right' : 'below'}
          </button>
        </div>
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

function SpellModal({ spell, onClose }) {
  const normalFields = Object.entries(spell).filter(([key]) => !isRawField(key));
  const rawFields = Object.entries(spell).filter(([key]) => isRawField(key));

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
        <button className="modal-close" onClick={onClose}>x</button>

        <div className="modal-header">
          <div className="modal-no-art"><BookOpen /></div>

          <div>
            <h2 className="modal-title">{spell.Name}</h2>
            <div className="modal-subtitle">
              Rank {spell.Rank ?? '?'} | {spell.SpellType || '-'} | {spell.Rarity || '-'}
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

        <div className="modal-section">
          <h3>Text</h3>
          <div className="detailBlock"><b>Summary</b><p>{spell.Summary || '-'}</p></div>
          <div className="detailBlock"><b>Heighten</b><p>{spell.Heighten || '-'}</p></div>
          <div className="detailBlock"><b>Trigger</b><p>{spell.TriggerText || '-'}</p></div>
          <div className="detailBlock"><b>Target</b><p>{spell.Target || '-'}</p></div>
        </div>

        <div className="modal-section">
          <h3>All Spell Fields</h3>
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

function FeatModal({ feat, onClose }) {
  const normalFields = Object.entries(feat).filter(([key]) => !isRawField(key));
  const rawFields = Object.entries(feat).filter(([key]) => isRawField(key));

  function renderValue(key, value) {
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="monster-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>x</button>

        <div className="modal-header">
          <div className="modal-no-art"><Award /></div>

          <div>
            <h2 className="modal-title">{feat.Name}</h2>
            <div className="modal-subtitle">
              Level {feat.Level ?? '?'} | {feat.FeatType || '-'} | {feat.Rarity || '-'}
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

        <div className="modal-section">
          <h3>Feat Details</h3>
          <div className="modal-stat-grid">
            {['Level','FeatType','Rarity','PFS','SourceBook','SourcePage'].map((key) => (
              <div key={key} className="modal-stat">
                <span className="modal-stat-label">{key}</span>
                <span className="modal-stat-value">{feat[key] ?? '-'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-section">
          <h3>Text</h3>
          <div className="detailBlock"><b>Summary</b><p>{feat.Summary || '-'}</p></div>
        </div>

        <div className="modal-section">
          <h3>All Feat Fields</h3>
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

function EquipmentModal({ item, onClose }) {
  const normalFields = Object.entries(item).filter(([key]) => !isRawField(key));
  const rawFields = Object.entries(item).filter(([key]) => isRawField(key));

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
        <button className="modal-close" onClick={onClose}>x</button>

        <div className="modal-header">
          <div className="modal-no-art"><Package /></div>

          <div>
            <h2 className="modal-title">{item.Name}</h2>
            <div className="modal-subtitle">
              Level {item.Level ?? '?'} | {item.EquipmentType || '-'} | {item.Rarity || '-'}
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

        <div className="modal-section">
          <h3>Text</h3>
          <div className="detailBlock"><b>Summary</b><p>{item.Summary || '-'}</p></div>
          <div className="detailBlock"><b>Base item</b><p>{item.BaseItemText || '-'}</p></div>
          <div className="detailBlock"><b>Spell</b><p>{item.SpellText || '-'}</p></div>
          <div className="detailBlock"><b>Stage</b><p>{item.StageText || '-'}</p></div>
        </div>

        <div className="modal-section">
          <h3>All Equipment Fields</h3>
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
