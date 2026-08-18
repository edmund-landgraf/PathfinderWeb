import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function readEnableArt() {
  try {
    const envPath = join(dirname(fileURLToPath(import.meta.url)), '../server/.env');
    const line = readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .find((entry) => entry.startsWith('ENABLE_ART='));
    if (!line) return true;
    return line.slice('ENABLE_ART='.length).trim().toLowerCase() === 'true';
  } catch {
    return true;
  }
}

const ENABLE_ART = readEnableArt();
console.log(`ENABLE_ART=${ENABLE_ART}`);
console.log(
  ENABLE_ART
    ? 'Creature art: serving'
    : 'Creature art: locked (not serving until password)'
);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/': 'http://localhost:3333',
      '/schemas': 'http://localhost:3333',
      '/images': 'http://localhost:3333'
    }
  }
});
