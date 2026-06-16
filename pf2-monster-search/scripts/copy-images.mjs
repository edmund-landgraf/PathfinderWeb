import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(rootDir, 'images');
const targetDir = join(rootDir, 'client', 'public', 'images');

if (!existsSync(sourceDir)) {
  console.warn(`Images source not found: ${sourceDir}`);
  process.exit(0);
}

mkdirSync(targetDir, { recursive: true });

let copied = 0;
for (const file of readdirSync(sourceDir)) {
  if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(file)) continue;
  cpSync(join(sourceDir, file), join(targetDir, file));
  copied += 1;
}

console.log(`Copied ${copied} image file(s) to ${targetDir}`);
