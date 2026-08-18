import { execSync } from 'node:child_process';

function runPowerShell(script) {
  return execSync(
    `powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8' }
  ).trim();
}

export function findListeningPids(port) {
  if (process.platform === 'win32') {
    try {
      const out = runPowerShell(
        `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique`
      );
      return out
        ? out.split('\n').map((value) => value.trim()).filter((value) => /^\d+$/.test(value))
        : [];
    } catch {
      return [];
    }
  }

  try {
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { encoding: 'utf8' });
    return out.split('\n').map((value) => value.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function killPid(pid) {
  const id = Number(pid);
  if (!Number.isInteger(id) || id <= 0) return false;

  if (process.platform === 'win32') {
    try {
      runPowerShell(`Stop-Process -Id ${id} -Force -ErrorAction Stop`);
      return true;
    } catch {
      try {
        execSync(`taskkill /PID ${id} /F /T`, { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    }
  }

  try {
    execSync(`kill -9 ${id}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function freePort(port, { excludePids = [] } = {}) {
  const exclude = new Set(excludePids.map(Number));
  let freed = 0;

  for (const pid of findListeningPids(port)) {
    const numericPid = Number(pid);
    if (exclude.has(numericPid)) continue;
    if (killPid(numericPid)) {
      console.log(`Freed port ${port} (stopped PID ${numericPid})`);
      freed += 1;
    }
  }

  return freed;
}

export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function isPortListening(port) {
  return findListeningPids(port).length > 0;
}
