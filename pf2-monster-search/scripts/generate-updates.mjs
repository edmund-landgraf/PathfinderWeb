import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const extraPath = join(rootDir, 'scripts', 'updates.extra.json');
const outputPath = join(rootDir, 'client', 'public', 'updates.json');
const utilitiesRepo = 'edmund-landgraf/PathfinderUtilities';

function resolveGitRoot() {
  let dir = rootDir;

  while (true) {
    try {
      const toplevel = execSync('git -c safe.directory=* rev-parse --show-toplevel', {
        cwd: dir,
        encoding: 'utf8'
      }).trim();
      execSync('git -c safe.directory=* rev-parse HEAD', { cwd: toplevel, stdio: 'ignore' });
      return toplevel;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }
}

function readGitEntries() {
  const gitRoot = resolveGitRoot();
  if (!gitRoot) {
    console.warn('Could not find a git repository with commits for web update history.');
    return [];
  }

  try {
    const output = execSync(
      'git -c safe.directory=* log --format="%ad|%s" --date=short',
      { cwd: gitRoot, encoding: 'utf8' }
    );

    return output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf('|');
        const date = line.slice(0, separator);
        const comment = line.slice(separator + 1).trim();
        return { date, comment };
      });
  } catch (error) {
    console.warn('Could not read git log:', error.message);
    return [];
  }
}

function readExtraEntries() {
  try {
    const parsed = JSON.parse(readFileSync(extraPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function dedupeEntries(entries) {
  const seen = new Set();

  return entries.filter((entry) => {
    const key = `${entry.date}::${entry.comment}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    const dateCompare = right.date.localeCompare(left.date);
    if (dateCompare !== 0) return dateCompare;
    return left.comment.localeCompare(right.comment);
  });
}

function utilitiesRepoCandidates() {
  return [
    process.env.UTILITIES_REPO_PATH,
    join(homedir(), 'node-sites', 'PathfinderUtilities')
  ].filter(Boolean);
}

function readUtilitiesGitEntries() {
  for (const dir of utilitiesRepoCandidates()) {
    try {
      execSync('git -c safe.directory=* rev-parse --is-inside-work-tree', {
        cwd: dir,
        stdio: 'ignore'
      });
      try {
        execSync('git -c safe.directory=* fetch --quiet origin main', {
          cwd: dir,
          stdio: 'ignore'
        });
      } catch (error) {
        console.warn(`Could not fetch PathfinderUtilities in ${dir}: ${error.message}`);
      }

      const output = execSync(
        'git -c safe.directory=* log origin/main --format="%ad|%s" --date=short',
        { cwd: dir, encoding: 'utf8' }
      );

      return output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const separator = line.indexOf('|');
          return {
            date: line.slice(0, separator),
            comment: line.slice(separator + 1).trim()
          };
        })
        .filter((entry) => entry.date && entry.comment);
    } catch {
      // Try the next checkout, then the GitHub API.
    }
  }

  return null;
}

async function readUtilitiesEntries() {
  const gitEntries = readUtilitiesGitEntries();
  if (gitEntries) return gitEntries;

  const entries = [];
  let page = 1;
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'pf2-monster-search-updates'
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  while (page <= 20) {
    const url = `https://api.github.com/repos/${utilitiesRepo}/commits?per_page=100&page=${page}`;
    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.warn(`Could not read GitHub commits (${response.status}) for ${utilitiesRepo}`);
      break;
    }

    const commits = await response.json();
    if (!Array.isArray(commits) || commits.length === 0) break;

    for (const commit of commits) {
      const date = (
        commit.commit?.author?.date ||
        commit.commit?.committer?.date ||
        ''
      ).slice(0, 10);
      const message = String(commit.commit?.message || '').trim();

      if (!date || !message) continue;

      for (const line of message.split('\n')) {
        const comment = line.trim();
        if (comment) entries.push({ date, comment });
      }
    }

    if (commits.length < 100) break;
    page += 1;
  }

  return entries;
}

const webEntries = sortEntries(dedupeEntries([
  ...readExtraEntries(),
  ...readGitEntries()
]));

const utilitiesEntries = sortEntries(dedupeEntries(await readUtilitiesEntries()));

const payload = {
  generatedAt: new Date().toISOString(),
  web: {
    title: 'PF2 Search (Web)',
    entries: webEntries
  },
  utilities: {
    title: 'Pathfinder Utilities',
    entries: utilitiesEntries
  }
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Wrote ${webEntries.length} web entries and ${utilitiesEntries.length} utilities entries to ${outputPath}`);
