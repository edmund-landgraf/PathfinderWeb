import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function readServerPort() {
  const envPath = join(rootDir, 'server', '.env');
  if (!existsSync(envPath)) return 3333;
  const match = readFileSync(envPath, 'utf8').match(/^PORT=(\d+)/m);
  return match ? Number(match[1]) : 3333;
}

const DEV_PORTS = [readServerPort(), 5173];

function runPowerShell(script) {
  return execSync(
    `powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8' }
  ).trim();
}

function findListeningPids(port) {
  if (process.platform !== 'win32') {
    try {
      const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { encoding: 'utf8' });
      return out.split('\n').map((value) => value.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  try {
    const out = runPowerShell(
      `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique`
    );
    return out ? out.split('\n').map((value) => value.trim()).filter(/^\d+$/.test.bind(/^\d+$/)) : [];
  } catch {
    return [];
  }
}

function getProcessInfo(pid) {
  if (process.platform !== 'win32') {
    return { pid, name: 'process', parentPid: null, commandLine: '' };
  }

  try {
    const out = runPowerShell(
      `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; if ($p) { $cmd = $p.CommandLine; if (-not $cmd) { $cmd = '' }; Write-Output ($p.Name + '|' + $p.ParentProcessId + '|' + $cmd) }`
    );
    if (!out) return { pid, name: 'unknown', parentPid: null, commandLine: '' };
    const [name, parentPid, ...commandParts] = out.split('|');
    return {
      pid,
      name,
      parentPid: parentPid ? Number(parentPid) : null,
      commandLine: commandParts.join('|')
    };
  } catch {
    return { pid, name: 'unknown', parentPid: null, commandLine: '' };
  }
}

function walkProcessChain(pid, maxDepth = 12) {
  const chain = [];
  let currentPid = pid;
  const seen = new Set();

  while (currentPid && !seen.has(currentPid) && chain.length < maxDepth) {
    seen.add(currentPid);
    const info = getProcessInfo(currentPid);
    chain.push(info);
    currentPid = info.parentPid;
  }

  return chain;
}

console.log('PF2 dev port trace');
console.log(`Project: ${rootDir}`);
console.log('');

const portRows = [];
for (const port of DEV_PORTS) {
  const pids = findListeningPids(port);
  if (!pids.length) {
    console.log(`Port ${port}: free`);
    continue;
  }

  for (const pid of pids) {
    const chain = walkProcessChain(Number(pid));
    portRows.push({ port, pid, chain });
    console.log(`Port ${port}: PID ${pid} (${chain[0]?.name ?? 'unknown'})`);
    chain.forEach((step, index) => {
      const prefix = index === 0 ? '  process' : '  parent ';
      const cmd = step.commandLine ? ` — ${step.commandLine}` : '';
      console.log(`${prefix}: ${step.pid} ${step.name}${cmd}`);
    });
    console.log('');
  }
}

if (!portRows.length) {
  console.log('All dev ports are free. npm run dev should start cleanly.');
  process.exit(0);
}

const rootCandidates = new Set(
  portRows.flatMap(({ chain }) => chain.map((step) => step.pid))
);

console.log('Suggested cleanup (run in this same PowerShell window):');
console.log('  npm run dev:stop');
console.log('');
console.log('If that fails, force-stop the listeners:');
console.log(
  `  Get-NetTCPConnection -LocalPort ${DEV_PORTS.join(',')} -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
);
console.log('');
console.log('Deprecation warning trace (concurrently):');
console.log('  set NODE_OPTIONS=--trace-deprecation');
console.log('  npm run dev');

process.exitCode = 1;
