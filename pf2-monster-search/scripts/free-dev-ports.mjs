import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort, isPortListening } from '../server/src/freePort.mjs';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function readServerPort() {
  const envPath = join(rootDir, 'server', '.env');
  if (!existsSync(envPath)) return 3333;
  const match = readFileSync(envPath, 'utf8').match(/^PORT=(\d+)/m);
  return match ? Number(match[1]) : 3333;
}

const DEV_PORTS = [readServerPort(), 5173];

let freed = 0;
let blocked = 0;

for (const devPort of DEV_PORTS) {
  if (!isPortListening(devPort)) continue;
  freed += freePort(devPort, { excludePids: [process.pid] });
  if (isPortListening(devPort)) {
    blocked += 1;
    console.warn(`Port ${devPort} is still in use after cleanup.`);
  }
}

if (blocked > 0) {
  console.warn('Run npm run dev:trace for the process tree and manual cleanup commands.');
  process.exitCode = 1;
} else if (freed === 0) {
  console.log(`Dev ports ${DEV_PORTS.join(', ')} are free.`);
}
