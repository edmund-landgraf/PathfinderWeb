import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from '../src/db.js';

const defaultPath = resolve(dirname(fileURLToPath(import.meta.url)), 'ensure_monster_search_indexes.sql');
const filePath = resolve(process.argv[2] || defaultPath);
const sqlText = readFileSync(filePath, 'utf8');
const batches = sqlText
  .split(/^\s*GO\s*$/gim)
  .map((batch) => batch.trim())
  .filter(Boolean);

const pool = await getPool();

for (const [index, batch] of batches.entries()) {
  console.log(`Running batch ${index + 1}/${batches.length}...`);
  await pool.request().query(batch);
}

console.log('Applied', filePath);
process.exit(0);
