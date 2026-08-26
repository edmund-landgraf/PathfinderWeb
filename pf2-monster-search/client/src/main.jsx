import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import SwaggerUI from 'swagger-ui-react';
import { Search, RotateCcw, ExternalLink, Image as ImageIcon, BookOpen, Award, Package, UserRound, Settings, Plus } from 'lucide-react';
import remarkGfm from 'remark-gfm';
import 'swagger-ui-react/swagger-ui.css';
import {
  extractMarkdownDescriptionMonster,
  extractMarkdownDescriptionFeatsEquipSpells,
  extractMarkdownRemainderFeatsEquipSpells
} from './markdownExtract.js';
import { utilitiesUpdatesDescription, webUpdatesDescription } from './updatesDescriptions.js';
import { imageLibraryEntries } from './imagesLibrary.js';
import './styles.css';


async function readApiError(res) {
  const text = await res.text();
  if (!text) return `Request failed (${res.status})`;

  try {
    const data = JSON.parse(text);
    if (typeof data.error === 'string' && data.error) return data.error;
    if (data.error) return JSON.stringify(data.error);
    return text;
  } catch {
    return text;
  }
}

const API_FETCH_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 130000);

async function fetchApi(url, options = {}) {
  return fetch(url, {
    ...options,
    credentials: 'include',
    signal: options.signal ?? AbortSignal.timeout(API_FETCH_TIMEOUT_MS)
  });
}

const emptyFilters = {
  name: '',
  levelMin: '',
  levelMax: '',
  rarity: '',
  size: '',
  alignment: '',
  family: '',
  gameSystem: 'PF2',
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
  nameStartsWith: '',
  contentType: '',
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
  nameStartsWith: '',
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
  nameStartsWith: '',
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
  nameStartsWith: '',
  limit: '100'
};

const columns = [
  ['Name', 'Name'],
  ['Level', 'Level'],
  ['Rarity', 'Rarity'],
  ['Size', 'Size'],
  ['Alignment', 'Align'],
  ['Family', 'Family'],
  ['GameSystem', 'Game'],
  ['SourceType', 'Source Type'],
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

function getVisibleRowJumpSize() {
  const tableWrap = document.querySelector('.resultsPanel .tableWrap');
  const sampleRow = tableWrap?.querySelector('tbody tr[data-row-id]');
  if (!tableWrap || !sampleRow) return 10;

  const rowHeight = sampleRow.getBoundingClientRect().height;
  if (!rowHeight) return 10;

  return Math.max(1, Math.floor(tableWrap.clientHeight / rowHeight));
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
    if (!enabled) return;

    function handleKeyDown(event) {
      if (isEditableTarget(event.target)) return;
      if (isNestedPopoutOpen()) return;

      if (event.key === 'Home' || event.key === 'End') {
        if (rows.length === 0) return;

        const nextIndex = event.key === 'Home' ? 0 : rows.length - 1;
        const currentIndex = selected
          ? rows.findIndex((row) => row[idField] === selected[idField])
          : -1;
        if (currentIndex === nextIndex) return;

        event.preventDefault();
        const nextRow = rows[nextIndex];
        onChange(nextRow);
        scrollResultRowIntoView(nextRow[idField]);
        return;
      }

      if (!selected) return;

      const isUp = event.key === 'ArrowUp' || event.key === 'PageUp';
      const isDown = event.key === 'ArrowDown' || event.key === 'PageDown';
      if (!isUp && !isDown) return;

      const index = rows.findIndex((row) => row[idField] === selected[idField]);
      if (index === -1) return;

      const step = event.key === 'PageUp' || event.key === 'PageDown'
        ? getVisibleRowJumpSize()
        : 1;
      const nextIndex = isUp ? index - step : index + step;
      const clampedIndex = Math.max(0, Math.min(rows.length - 1, nextIndex));
      if (clampedIndex === index) return;

      event.preventDefault();
      const nextRow = rows[clampedIndex];
      onChange(nextRow);
      scrollResultRowIntoView(nextRow[idField]);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [rows, selected, onChange, idField, enabled]);
}

function useGridPageNavigation({
  offset,
  limit,
  total,
  loading,
  onPrevPage,
  onNextPage,
  enabled = true
}) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event) {
      const isPrev = event.key === 'ArrowLeft';
      const isNext = event.key === 'ArrowRight';
      if (!isPrev && !isNext) return;
      if (isEditableTarget(event.target)) return;
      if (isNestedPopoutOpen()) return;
      if (loading) return;

      if (isPrev && offset > 0) {
        event.preventDefault();
        onPrevPage();
        return;
      }

      if (isNext && offset + limit < total) {
        event.preventDefault();
        onNextPage();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [offset, limit, total, loading, onPrevPage, onNextPage, enabled]);
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

const alphabetLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function AlphabetBar({ value, onChange, disabled }) {
  const selected = value || '';

  return (
    <div className="letterBar" role="radiogroup" aria-label="Filter by first letter">
      <button
        type="button"
        className={selected === '' ? 'letterBarOption active' : 'letterBarOption'}
        role="radio"
        aria-checked={selected === ''}
        disabled={disabled}
        onClick={() => onChange('')}
      >
        All
      </button>
      {alphabetLetters.map((letter) => (
        <button
          key={letter}
          type="button"
          className={selected === letter ? 'letterBarOption active' : 'letterBarOption'}
          role="radio"
          aria-checked={selected === letter}
          disabled={disabled}
          onClick={() => onChange(letter)}
        >
          {letter}
        </button>
      ))}
    </div>
  );
}

function RowRangeBar({ enabled, total, limit, offset, loading, onChange }) {
  if (enabled === false || total <= limit) return null;

  const pageCount = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="rowRangeBar" aria-label="Jump by 100-row group">
      {Array.from({ length: pageCount }, (_, index) => {
        const pageNumber = index + 1;
        const rangeStart = index * limit + 1;
        const rangeEnd = Math.min((index + 1) * limit, total);

        return (
          <button
            key={pageNumber}
            type="button"
            className={currentPage === pageNumber ? 'rowRangeOption active' : 'rowRangeOption'}
            disabled={loading}
            aria-current={currentPage === pageNumber ? 'page' : undefined}
            title={String(rangeStart) + '-' + String(rangeEnd)}
            onClick={() => onChange(index * limit)}
          >
            {pageNumber}
          </button>
        );
      })}
    </div>
  );
}

function SegmentedInput({ value, onChange, options }) {
  return (
    <div className="segmentedInput" role="radiogroup">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? 'segmentedOption active' : 'segmentedOption'}
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
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

const ArtContext = createContext({
  artEnabled: true,
  showArtUnlock: false,
  unlockArt: async () => false
});

function useArt() {
  return useContext(ArtContext);
}

function ArtProvider({ children }) {
  const [enableArtByEnv, setEnableArtByEnv] = useState(null);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchApi('/api/config')
      .then((res) => {
        if (!res.ok) throw new Error('Could not load config.');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setEnableArtByEnv(Boolean(data.enableArt));
        setUnlocked(Boolean(data.artUnlocked));
      })
      .catch(() => {
        if (!cancelled) setEnableArtByEnv(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const unlockArt = useCallback(async (password) => {
    const res = await fetchApi('/api/art/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    if (!res.ok) {
      throw new Error(await readApiError(res));
    }

    window.location.reload();
    return true;
  }, []);

  const value = useMemo(() => ({
    artEnabled: enableArtByEnv === true || unlocked,
    showArtUnlock: enableArtByEnv === false,
    unlockArt
  }), [enableArtByEnv, unlocked, unlockArt]);

  return <ArtContext.Provider value={value}>{children}</ArtContext.Provider>;
}

function SettingsMenu() {
  const { showArtUnlock, artEnabled, unlockArt } = useArt();
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClick(event) {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!showArtUnlock) return null;

  async function submitPassword(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await unlockArt(password);
      setPassword('');
      setPasswordOpen(false);
      setOpen(false);
    } catch (err) {
      setError(err.message || 'Invalid password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="settingsMenu" ref={menuRef}>
      <button
        type="button"
        className="layoutButton"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Settings size={16} /> Settings
      </button>

      {open && (
        <div className="settingsDropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            disabled={artEnabled}
            onClick={() => {
              setOpen(false);
              setPasswordOpen(true);
              setError('');
            }}
          >
            {artEnabled ? 'Art enabled' : 'Enable Art (requires password)'}
          </button>
        </div>
      )}

      {passwordOpen && (
        <div className="modal-backdrop settingsPasswordBackdrop" onClick={() => setPasswordOpen(false)}>
          <form className="settingsPasswordModal" onClick={(e) => e.stopPropagation()} onSubmit={submitPassword}>
            <h2>Enable Art</h2>
            <p>Enter the password to show preview and modal art.</p>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
            {error && <p className="error">{error}</p>}
            <div className="actions">
              <button type="submit" className="primary" disabled={submitting || !password}>Enable</button>
              <button type="button" onClick={() => setPasswordOpen(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function NavBar({ currentPage, onNavigate, className = '' }) {
  return (
    <div className={`topbarActions ${className}`.trim()}>
      <nav className="navBar" aria-label="Primary">
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
      <SettingsMenu />
    </div>
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
  if (path === '/api-docs') return 'api-docs';
  return 'home';
}

function App() {
  return (
    <ArtProvider>
      <AppRoutes />
    </ArtProvider>
  );
}

function AppRoutes() {
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

  if (page === 'api-docs') {
    return <ApiPage onNavigate={navigate} />;
  }

  return <HomePage onNavigate={navigate} />;
}

function HomePage({ onNavigate }) {
  return (
    <div className="app homePage">
      <header className="homeTopbar">
        <SettingsMenu />
      </header>
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
          <button className="homeUpdatesButton" onClick={() => onNavigate('/api-docs')}>
            API
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
        <SettingsMenu />
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

const API_DOC_SOURCES = [
  {
    id: 'md',
    label: 'API.md',
    description: 'Endpoint guide with curl examples',
    path: '/schemas/API.md',
    format: 'markdown'
  },
  {
    id: 'yaml',
    label: 'openapi.yaml',
    description: 'OpenAPI 3.0 specification',
    path: '/schemas/openapi.yaml',
    format: 'yaml'
  },
  {
    id: 'swagger',
    label: 'Try it',
    description: 'Interactive Swagger UI explorer',
    path: '/schemas/openapi.yaml',
    format: 'swagger'
  },
  ...imageLibraryEntries.map((image) => ({
    id: image.id,
    label: image.label,
    description: image.description,
    path: image.path,
    alt: image.alt,
    format: 'image'
  }))
];

function ApiPage({ onNavigate }) {
  const [selectedId, setSelectedId] = useState('md');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const selected = API_DOC_SOURCES.find((source) => source.id === selectedId) || API_DOC_SOURCES[0];

  useEffect(() => {
    if (selected.format === 'swagger' || selected.format === 'image') {
      setLoading(false);
      setError('');
      setContent('');
      return undefined;
    }

    let cancelled = false;

    setLoading(true);
    setError('');

    fetch(selected.path)
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load ${selected.label}.`);
        return response.text();
      })
      .then((text) => {
        if (!cancelled) setContent(text);
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
  }, [selected.path, selected.label, selected.format]);

  return (
    <div className="app apiPage">
      <header className="apiTopbar">
        <button className="apiHomeButton" onClick={() => onNavigate('/')}>Home</button>
        <SettingsMenu />
      </header>

      <main className="apiShell">
        <div className="apiIntro">
          <h1>API</h1>
          <p>REST API documentation for PF2 Search.</p>
        </div>

        <div className="apiSplit">
          <aside className="apiMaster">
            <h2>Documents</h2>
            <ul className="apiMasterList">
              {API_DOC_SOURCES.map((source) => (
                <li key={source.id}>
                  <button
                    type="button"
                    className={`apiMasterButton${source.id === selectedId ? ' apiMasterActive' : ''}`}
                    onClick={() => setSelectedId(source.id)}
                    aria-current={source.id === selectedId ? 'true' : undefined}
                  >
                    <span className="apiMasterLabel">{source.label}</span>
                    <span className="apiMasterDescription">{source.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="apiDetail" aria-label={selected.label}>
            <header className="apiDetailHeader">
              <h2>{selected.label}</h2>
            </header>

            {loading && selected.format !== 'swagger' && selected.format !== 'image' && (
              <p className="apiStatus">Loading document…</p>
            )}
            {error && <p className="apiStatus apiError">{error}</p>}

            {!loading && !error && selected.format === 'markdown' && (
              <MarkdownViewer rawMD={content} className="apiMarkdownViewer" />
            )}

            {!loading && !error && selected.format === 'yaml' && (
              <YamlViewer content={content} className="apiYamlViewer" />
            )}

            {selected.format === 'swagger' && (
              <ApiSwaggerViewer className="apiSwaggerViewer" />
            )}

            {selected.format === 'image' && (
              <ApiImageViewer
                src={selected.path}
                alt={selected.alt || selected.label}
                className="apiImageViewer"
              />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function YamlViewer({ content, className = '' }) {
  return (
    <pre className={`yamlViewer ${className}`.trim()}>
      <code>{content}</code>
    </pre>
  );
}

function withRuntimeSwaggerServer(specText) {
  const origin = window.location.origin;
  const serverBlock = [
    'servers:',
    `  - url: ${origin}`,
    '    description: Current API host'
  ].join('\n');

  if (/^servers:\r?\n(?:[ \t].*(?:\r?\n|$))+/m.test(specText)) {
    return specText.replace(/^servers:\r?\n(?:[ \t].*(?:\r?\n|$))+/m, `${serverBlock}\n\n`);
  }

  return specText.replace(/^security:/m, `${serverBlock}\n\nsecurity:`);
}

function ApiSwaggerViewer({ className = '' }) {
  const [specUrl, setSpecUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';

    fetch('/schemas/openapi.yaml')
      .then((response) => {
        if (!response.ok) throw new Error('Could not load openapi.yaml.');
        return response.text();
      })
      .then((text) => {
        if (cancelled) return;
        const runtimeSpec = withRuntimeSwaggerServer(text);
        objectUrl = URL.createObjectURL(new Blob([runtimeSpec], { type: 'application/yaml' }));
        setSpecUrl(objectUrl);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || String(err));
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  const requestInterceptor = useCallback((request) => {
    if (request.url?.startsWith('http://localhost:3333/')) {
      request.url = request.url.replace('http://localhost:3333', window.location.origin);
    }
    return request;
  }, []);

  if (error) return <p className="apiStatus apiError">{error}</p>;
  if (!specUrl) return <p className="apiStatus">Loading Swagger...</p>;

  return (
    <div className={className}>
      <SwaggerUI
        url={specUrl}
        docExpansion="list"
        defaultModelsExpandDepth={-1}
        requestInterceptor={requestInterceptor}
        tryItOutEnabled
      />
    </div>
  );
}

function ApiImageViewer({ src, alt, className = '' }) {
  return (
    <div className={className}>
      <img src={src} alt={alt} />
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
    const res = await fetchApi('/api/spell-lookups');
    if (!res.ok) throw new Error(await readApiError(res));
    setLookups(await res.json());
  }

  async function search(newOffset = 0, nextFilters = filters) {
    setLoading(true);
    setError('');
    try {
      const qs = buildQuery(nextFilters, newOffset, sortBy, sortDir);
      const res = await fetchApi(`/api/spells?${qs}`);
      if (!res.ok) throw new Error(await readApiError(res));
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
    search(0, emptySpellFilters);
  }

  function setNameStartsWith(letter) {
    const nextFilters = { ...filters, nameStartsWith: letter };
    setFilters(nextFilters);
    search(0, nextFilters);
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

  const goPrevPage = useCallback(() => {
    searchRef.current?.(Math.max(0, offset - limit));
  }, [offset, limit]);

  const goNextPage = useCallback(() => {
    searchRef.current?.(offset + limit);
  }, [offset, limit]);

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

  useGridPageNavigation({
    offset,
    limit,
    total,
    loading,
    onPrevPage: goPrevPage,
    onNextPage: goNextPage,
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
            <AlphabetBar value={filters.nameStartsWith} onChange={setNameStartsWith} disabled={loading} />
            <RowRangeBar
              enabled={Boolean(filters.nameStartsWith)}
              total={total}
              limit={limit}
              offset={offset}
              loading={loading}
              onChange={search}
            />
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
    const res = await fetchApi('/api/feat-lookups');
    if (!res.ok) throw new Error(await readApiError(res));
    setLookups(await res.json());
  }

  async function search(newOffset = 0, nextFilters = filters) {
    setLoading(true);
    setError('');
    try {
      const qs = buildQuery(nextFilters, newOffset, sortBy, sortDir);
      const res = await fetchApi(`/api/feats?${qs}`);
      if (!res.ok) throw new Error(await readApiError(res));
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
    search(0, emptyFeatFilters);
  }

  function setNameStartsWith(letter) {
    const nextFilters = { ...filters, nameStartsWith: letter };
    setFilters(nextFilters);
    search(0, nextFilters);
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

  const goPrevPage = useCallback(() => {
    searchRef.current?.(Math.max(0, offset - limit));
  }, [offset, limit]);

  const goNextPage = useCallback(() => {
    searchRef.current?.(offset + limit);
  }, [offset, limit]);

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

  useGridPageNavigation({
    offset,
    limit,
    total,
    loading,
    onPrevPage: goPrevPage,
    onNextPage: goNextPage,
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
            <AlphabetBar value={filters.nameStartsWith} onChange={setNameStartsWith} disabled={loading} />
            <RowRangeBar
              enabled={Boolean(filters.nameStartsWith)}
              total={total}
              limit={limit}
              offset={offset}
              loading={loading}
              onChange={search}
            />
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
    const res = await fetchApi('/api/equipment-lookups');
    if (!res.ok) throw new Error(await readApiError(res));
    setLookups(await res.json());
  }

  async function search(newOffset = 0, nextFilters = filters) {
    setLoading(true);
    setError('');
    try {
      const qs = buildQuery(nextFilters, newOffset, sortBy, sortDir);
      const res = await fetchApi(`/api/equipment?${qs}`);
      if (!res.ok) throw new Error(await readApiError(res));
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
    search(0, emptyEquipmentFilters);
  }

  function setNameStartsWith(letter) {
    const nextFilters = { ...filters, nameStartsWith: letter };
    setFilters(nextFilters);
    search(0, nextFilters);
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

  const goPrevPage = useCallback(() => {
    searchRef.current?.(Math.max(0, offset - limit));
  }, [offset, limit]);

  const goNextPage = useCallback(() => {
    searchRef.current?.(offset + limit);
  }, [offset, limit]);

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

  useGridPageNavigation({
    offset,
    limit,
    total,
    loading,
    onPrevPage: goPrevPage,
    onNextPage: goNextPage,
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
            <AlphabetBar value={filters.nameStartsWith} onChange={setNameStartsWith} disabled={loading} />
            <RowRangeBar
              enabled={Boolean(filters.nameStartsWith)}
              total={total}
              limit={limit}
              offset={offset}
              loading={loading}
              onChange={search}
            />
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

const emptyUserMonsterForm = {
  name: '',
  level: '',
  rarity: '',
  size: '',
  alignment: '',
  family: '',
  sourceBook: '',
  gameSystem: 'PF2',
  isUnique: false,
  hp: '',
  ac: '',
  fortitude: '',
  reflex: '',
  will: '',
  perception: '',
  speed: '',
  senses: '',
  languages: '',
  skills: '',
  rawMD: '',
  imageDataUrl: ''
};

function TextAreaInput({ value, onChange, placeholder, rows = 4 }) {
  return <textarea value={value} rows={rows} placeholder={placeholder || ''} onChange={e => onChange(e.target.value)} />;
}

function getMonsterImageUrl(monster, variant = 'thumb') {
  if (!monster?.ImageUrl) return '';
  if (monster.SourceType === 'my monsters' || monster.ContentType === 'user generated') return monster.ImageUrl.replace('/image/thumb', '/image');
  return variant === 'full' ? `/api/monsters/${monster.MonsterId}/image` : monster.ImageUrl;
}

function AddUserMonsterModal({ lookups, onClose, onCreated }) {
  const [form, setForm] = useState(emptyUserMonsterForm);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function readImage(file) {
    if (!file) {
      setField('imageDataUrl', '');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setField('imageDataUrl', String(reader.result || ''));
    reader.onerror = () => setError('Could not read image file.');
    reader.readAsDataURL(file);
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const payload = {
        ...form,
        isUnique: Boolean(form.isUnique),
        isNpc: false
      };
      const res = await fetchApi('/api/user-monsters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const created = await res.json();
      onCreated(created);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="userMonsterModal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="userMonsterModalHeader">
          <div>
            <h2>Add User Monster</h2>
            <p>Content type: user generated</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="userMonsterGrid">
          <Field label="Name"><TextInput value={form.name} onChange={v => setField('name', v)} placeholder="Creature name" /></Field>
          <Field label="Level"><TextInput value={form.level} onChange={v => setField('level', v)} /></Field>
          <Field label="Rarity"><SelectInput value={form.rarity} onChange={v => setField('rarity', v)} options={lookups.rarity} /></Field>
          <Field label="Size"><SelectInput value={form.size} onChange={v => setField('size', v)} options={lookups.size} /></Field>
          <Field label="Alignment"><SelectInput value={form.alignment} onChange={v => setField('alignment', v)} options={lookups.alignment} /></Field>
          <Field label="Family"><TextInput value={form.family} onChange={v => setField('family', v)} /></Field>
          <Field label="Source"><TextInput value={form.sourceBook} onChange={v => setField('sourceBook', v)} placeholder="My Monsters" /></Field>
          <Field label="Game"><SegmentedInput value={form.gameSystem} onChange={v => setField('gameSystem', v)} options={[{ value: 'PF2', label: 'PF2' }, { value: 'SF2', label: 'SF2' }]} /></Field>
          <Field label="HP"><TextInput value={form.hp} onChange={v => setField('hp', v)} /></Field>
          <Field label="AC"><TextInput value={form.ac} onChange={v => setField('ac', v)} /></Field>
          <Field label="Fort"><TextInput value={form.fortitude} onChange={v => setField('fortitude', v)} /></Field>
          <Field label="Ref"><TextInput value={form.reflex} onChange={v => setField('reflex', v)} /></Field>
          <Field label="Will"><TextInput value={form.will} onChange={v => setField('will', v)} /></Field>
          <Field label="Perception"><TextInput value={form.perception} onChange={v => setField('perception', v)} /></Field>
          <Field label="Speed"><TextInput value={form.speed} onChange={v => setField('speed', v)} /></Field>
          <label className="field checkboxField"><span>Unique</span><input type="checkbox" checked={form.isUnique} onChange={e => setField('isUnique', e.target.checked)} /></label>
        </div>

        <div className="userMonsterWideFields">
          <Field label="Senses"><TextInput value={form.senses} onChange={v => setField('senses', v)} /></Field>
          <Field label="Languages"><TextInput value={form.languages} onChange={v => setField('languages', v)} /></Field>
          <Field label="Skills"><TextInput value={form.skills} onChange={v => setField('skills', v)} /></Field>
          <Field label="Description / Raw MD"><TextAreaInput value={form.rawMD} onChange={v => setField('rawMD', v)} placeholder="# Creature Name" rows={7} /></Field>
          <label className="field imageUploadField">
            <span>Image</span>
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={e => readImage(e.target.files?.[0])} />
            {form.imageDataUrl && <img src={form.imageDataUrl} alt="Preview" />}
          </label>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="actions userMonsterActions">
          <button type="submit" className="primary" disabled={submitting || !form.name}><Plus size={16} /> Add Monster</button>
          <button type="button" onClick={onClose} disabled={submitting}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function CreatureSearchPage({
  onNavigate,
  currentPage,
  apiPath,
  title,
  subtitle,
  detailTitle = 'Double-click to open full details',
  allowUserAdd = false
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
  const [isAddUserMonsterOpen, setIsAddUserMonsterOpen] = useState(false);
  // Grid layout toggle (right/below) — disabled for now
  // const [layout, setLayout] = useState('right');
  const searchRef = useRef(null);


  const limit = useMemo(() => Math.min(Math.max(Number(filters.limit || 100), 1), 500), [filters.limit]);

  function setFilter(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  async function fetchLookups() {
    const res = await fetchApi('/api/lookups');
    if (!res.ok) throw new Error(await readApiError(res));
    setLookups(await res.json());
  }

  async function search(newOffset = 0, nextFilters = filters) {
    setLoading(true);
    setError('');
    try {
      const qs = buildQuery(nextFilters, newOffset, sortBy, sortDir);
      const res = await fetchApi(`/api/${apiPath}?${qs}`);
      if (!res.ok) throw new Error(await readApiError(res));
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
    search(0, emptyFilters);
  }

  function setNameStartsWith(letter) {
    const nextFilters = { ...filters, nameStartsWith: letter };
    setFilters(nextFilters);
    search(0, nextFilters);
  }

  function changeSort(col) {
    if (sortBy === col) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  }

  function handleUserMonsterCreated(monster) {
    setIsAddUserMonsterOpen(false);
    search(0);
    setSelected(monster);
    setSelectedMonster(monster);
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

  const goPrevPage = useCallback(() => {
    searchRef.current?.(Math.max(0, offset - limit));
  }, [offset, limit]);

  const goNextPage = useCallback(() => {
    searchRef.current?.(offset + limit);
  }, [offset, limit]);

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

  useGridPageNavigation({
    offset,
    limit,
    total,
    loading,
    onPrevPage: goPrevPage,
    onNextPage: goNextPage,
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
        <NavBar currentPage={currentPage} onNavigate={onNavigate} />
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
            <Field label="My monsters">
              <SegmentedInput
                value={filters.contentType}
                onChange={v => setFilter('contentType', v)}
                options={[
                  { value: '', label: 'Include' },
                  { value: 'user generated', label: 'Only mine' },
                  { value: 'canon', label: 'Canon only' }
                ]}
              />
            </Field>
            <Field label="Game">
              <SegmentedInput
                value={filters.gameSystem}
                onChange={v => setFilter('gameSystem', v)}
                options={[
                  { value: 'PF2', label: 'PF2' },
                  { value: 'SF2', label: 'SF2' }
                ]}
              />
            </Field>

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
            {allowUserAdd && (
              <button type="button" onClick={() => setIsAddUserMonsterOpen(true)} disabled={loading}>
                <Plus size={16} /> Add user monster
              </button>
            )}
          </div>

          {selected && <DetailCard monster={selected} />}
        </aside>

        <section className="resultsPanel">
          <div className="resultsHeader">
            <div>
              <strong>{loading ? 'Loading...' : `${pageStart}-${pageEnd} of ${total}`}</strong>
              {error && <span className="error"> {error}</span>}
            </div>
            <AlphabetBar value={filters.nameStartsWith} onChange={setNameStartsWith} disabled={loading} />
            <RowRangeBar
              enabled={Boolean(filters.nameStartsWith)}
              total={total}
              limit={limit}
              offset={offset}
              loading={loading}
              onChange={search}
            />
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
                      <MonsterArtThumbnail imageUrl={row.ImageUrl} alt={row.Name || ''} />
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

    {allowUserAdd && isAddUserMonsterOpen && (
      <AddUserMonsterModal
        lookups={lookups}
        onClose={() => setIsAddUserMonsterOpen(false)}
        onCreated={handleUserMonsterCreated}
      />
    )}

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
      subtitle="Search pf2.vwMonsterList for creatures, excluding NPCs."
      detailTitle="Double-click to open full monster details"
      allowUserAdd
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
      subtitle="Search pf2.vwMonsterList for NPCs."
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
            {feat.SourceBook && (
              <span>
                <SourceBookLinks
                  sourceBook={feat.SourceBook}
                  sourcePurchaseUrl={feat.SourcePurchaseURL}
                  linkClassName="detail-link"
                  showPage={false}
                />
              </span>
            )}
            {feat.PFS && <span>{feat.PFS}</span>}
            {feat.IsStandardAncestryFeat && <span>Standard ancestry</span>}
          </div>
          {feat.AonUrl && <a href={feat.AonUrl} target="_blank" rel="noreferrer">Open AoN <ExternalLink size={13} /></a>}
        </div>
      </div>
      <div className="detailBlock"><b>Summary</b><p>{feat.Summary || '-'}</p></div>
      <div className="detailBlock">
        <b>Source</b>
        <p>
          {feat.SourceBook ? (
            <SourceBookLinks
              sourceBook={feat.SourceBook}
              sourcePurchaseUrl={feat.SourcePurchaseURL}
              sourcePage={feat.SourcePage}
              linkClassName="detail-link"
            />
          ) : '-'}
        </p>
      </div>
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
            {item.SourceBook && (
              <span>
                <SourceBookLinks
                  sourceBook={item.SourceBook}
                  sourcePurchaseUrl={item.SourcePurchaseURL}
                  linkClassName="detail-link"
                  showPage={false}
                />
              </span>
            )}
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
      <div className="detailBlock">
        <b>Source</b>
        <p>
          {item.SourceBook ? (
            <SourceBookLinks
              sourceBook={item.SourceBook}
              sourcePurchaseUrl={item.SourcePurchaseURL}
              sourcePage={item.SourcePage}
              linkClassName="detail-link"
            />
          ) : '-'}
        </p>
      </div>
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
            {spell.SourceBook && (
              <span>
                <SourceBookLinks
                  sourceBook={spell.SourceBook}
                  sourcePurchaseUrl={spell.SourcePurchaseURL}
                  linkClassName="detail-link"
                  showPage={false}
                />
              </span>
            )}
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
      <div className="detailBlock">
        <b>Source</b>
        <p>
          {spell.SourceBook ? (
            <SourceBookLinks
              sourceBook={spell.SourceBook}
              sourcePurchaseUrl={spell.SourcePurchaseURL}
              sourcePage={spell.SourcePage}
              linkClassName="detail-link"
            />
          ) : '-'}
        </p>
      </div>
    </div>
  );
}

function DetailCard({ monster }) {
  return (
    <div className="detailCard">
      <div className="detailTop">
        <MonsterArtThumbnail
          imageUrl={getMonsterImageUrl(monster, 'full')}
          alt={monster.Name}
          className="detailArt"
        />
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
      <div className="detailBlock">
        <b>Source</b>
        <p>
          {monster.SourceBook ? (
            <SourceBookLinks
              sourceBook={monster.SourceBook}
              sourcePurchaseUrl={monster.SourcePurchaseURL}
              sourcePage={monster.SourcePage}
              linkClassName="detail-link"
            />
          ) : '-'}
        </p>
      </div>
    </div>
  );
}

function isUrlField(key, value) {
  return (
    key.toLowerCase().includes('url') &&
    key !== 'SourcePurchaseURL' &&
    typeof value === 'string' &&
    value.startsWith('http')
  );
}

function SourceBookLinks({
  sourceBook,
  sourcePurchaseUrl,
  sourcePage,
  className = '',
  linkClassName = 'modal-link',
  showPage = true
}) {
  if (!sourceBook) return showPage && sourcePage ? `pg. ${sourcePage}` : null;

  const names = String(sourceBook).split(',').map((part) => part.trim()).filter(Boolean);
  const urls = sourcePurchaseUrl
    ? String(sourcePurchaseUrl).split(',').map((part) => part.trim())
    : [];

  return (
    <span className={className}>
      {names.map((name, index) => {
        const url = urls[index] || '';
        const separator = index > 0 ? ', ' : '';

        if (url.startsWith('http')) {
          return (
            <span key={`${name}-${index}`}>
              {separator}
              <a href={url} target="_blank" rel="noreferrer" className={linkClassName}>
                {name}
              </a>
            </span>
          );
        }

        return (
          <span key={`${name}-${index}`}>
            {separator}
            {name}
          </span>
        );
      })}
      {showPage && sourcePage ? ` pg. ${sourcePage}` : ''}
    </span>
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

function renderModalValue(key, value, record) {
  if (key === 'SourceBook') {
    return (
      <SourceBookLinks
        sourceBook={value}
        sourcePurchaseUrl={record?.SourcePurchaseURL}
        sourcePage={record?.SourcePage}
        showPage={false}
      />
    );
  }

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
  const normalFields = Object.entries(record).filter(([key]) => (
    !isRawField(key) && key !== 'SourcePurchaseURL'
  ));
  const rawFields = Object.entries(record).filter(([key]) => (
    isRawField(key) && key.toLowerCase() !== 'rawmd'
  ));

  return { rawMD, normalFields, rawFields };
}

function MonsterArtThumbnail({ imageUrl, alt = '', size = 18, className = '' }) {
  const { artEnabled } = useArt();
  const [failed, setFailed] = useState(false);
  const emptyFrame = className.includes('detailArt')
    ? <div className="noArt" aria-hidden="true" />
    : <span className="artFrame" aria-hidden="true" />;

  if (!artEnabled) return emptyFrame;

  if (!imageUrl || failed) {
    return className.includes('detailArt')
      ? <div className="noArt"><ImageIcon size={size} /></div>
      : <ImageIcon size={size} className={className} />;
  }

  return (
    <img
      className={className}
      src={imageUrl}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function ModalArt({ imageUrl, alt, fallbackIcon, onImageOpen }) {
  const { artEnabled } = useArt();
  const [failed, setFailed] = useState(false);

  if (!artEnabled) {
    return <div className="modal-no-art" aria-hidden="true" />;
  }

  if (imageUrl && !failed) {
    return (
      <img
        className="modal-image modal-image-clickable"
        src={imageUrl}
        alt={alt}
        title="Double-click to view full size"
        onError={() => setFailed(true)}
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

function ModalAllFieldsSection({ title, normalFields, record }) {
  return (
    <div className="modal-section">
      <h3>{title}</h3>
      <div className="modal-field-grid">
        {normalFields.map(([key, value]) => (
          <div className="modal-field" key={key}>
            <div className="modal-field-label">{key}</div>
            <div className="modal-field-value">{renderModalValue(key, value, record)}</div>
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
  const { artEnabled } = useArt();
  const imageUrl = artEnabled ? getMonsterImageUrl(monster, 'full') : '';

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
                {monster.SourceBook && (
                  <span className="modal-pill">
                    <SourceBookLinks
                      sourceBook={monster.SourceBook}
                      sourcePurchaseUrl={monster.SourcePurchaseURL}
                      linkClassName="modal-pill-link"
                      showPage={false}
                    />
                  </span>
                )}
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

        <ModalAllFieldsSection title="All Monster Fields" normalFields={normalFields} record={monster} />
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
                {spell.SourceBook && (
                  <span className="modal-pill">
                    <SourceBookLinks
                      sourceBook={spell.SourceBook}
                      sourcePurchaseUrl={spell.SourcePurchaseURL}
                      linkClassName="modal-pill-link"
                      showPage={false}
                    />
                  </span>
                )}
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

        <ModalAllFieldsSection title="All Spell Fields" normalFields={normalFields} record={spell} />
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
                {feat.SourceBook && (
                  <span className="modal-pill">
                    <SourceBookLinks
                      sourceBook={feat.SourceBook}
                      sourcePurchaseUrl={feat.SourcePurchaseURL}
                      linkClassName="modal-pill-link"
                      showPage={false}
                    />
                  </span>
                )}
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
                <span className="modal-stat-value">{renderModalValue(key, feat[key], feat) || '-'}</span>
              </div>
            ))}
          </div>
        </div>

        <ModalAllFieldsSection title="All Feat Fields" normalFields={normalFields} record={feat} />
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
                {item.SourceBook && (
                  <span className="modal-pill">
                    <SourceBookLinks
                      sourceBook={item.SourceBook}
                      sourcePurchaseUrl={item.SourcePurchaseURL}
                      linkClassName="modal-pill-link"
                      showPage={false}
                    />
                  </span>
                )}
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
                <span className="modal-stat-value">{renderModalValue(key, item[key], item) || '-'}</span>
              </div>
            ))}
          </div>
        </div>

        <ModalAllFieldsSection title="All Equipment Fields" normalFields={normalFields} record={item} />
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
