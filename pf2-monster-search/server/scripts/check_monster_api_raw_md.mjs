const API_BASE = process.env.API_BASE || 'http://localhost:3333';

async function main() {
  const url = new URL('/api/monsters', API_BASE);
  url.searchParams.set('name', process.env.MONSTER_NAME || 'Abandoned Zealot');
  url.searchParams.set('limit', '5');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Monster API returned ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const rows = data.rows || [];
  const missing = rows.filter((row) => !String(row.RawMD || row.rawMD || '').trim());

  if (rows.length === 0) {
    throw new Error(`Monster API returned no rows for ${url.searchParams.get('name')}`);
  }

  if (missing.length > 0) {
    throw new Error(
      `Monster API returned ${missing.length}/${rows.length} rows without RawMD: ` +
      missing.map((row) => `${row.MonsterId}:${row.Name}`).join(', ')
    );
  }

  console.log(JSON.stringify({
    monsterApiRawMDCheck: true,
    rowsChecked: rows.length,
    apiBase: API_BASE,
    sample: rows.map((row) => ({
      MonsterId: row.MonsterId,
      Name: row.Name,
      RawMDLength: String(row.RawMD || row.rawMD || '').length
    }))
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    monsterApiRawMDCheck: false,
    error: error.message
  }, null, 2));
  process.exitCode = 1;
});
