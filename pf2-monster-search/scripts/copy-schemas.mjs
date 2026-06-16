import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(rootDir, 'schemas');
const targetDir = join(rootDir, 'client', 'public', 'schemas');

if (!existsSync(sourceDir)) {
  console.warn(`Schemas source not found: ${sourceDir}`);
  process.exit(0);
}

mkdirSync(targetDir, { recursive: true });

let copied = 0;
for (const file of readdirSync(sourceDir)) {
  if (!/\.(md|ya?ml)$/i.test(file)) continue;
  cpSync(join(sourceDir, file), join(targetDir, file));
  copied += 1;
}

console.log(`Copied ${copied} schema file(s) to ${targetDir}`);
