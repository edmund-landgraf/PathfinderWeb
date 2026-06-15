const API_BASE = process.env.API_BASE || 'http://localhost:3333';

const resources = [
  { label: 'Monster', path: '/api/monsters', idField: 'MonsterId', defaultName: 'Abandoned Zealot' },
  { label: 'Spell', path: '/api/spells', idField: 'SpellId' },
  { label: 'Feat', path: '/api/feats', idField: 'FeatId' },
  { label: 'Equipment', path: '/api/equipment', idField: 'EquipmentId' },
];

async function checkResource(resource) {
  const url = new URL(resource.path, API_BASE);
  url.searchParams.set('limit', '5');

  if (resource.defaultName) {
    url.searchParams.set('name', resource.defaultName);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${resource.label} API returned ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const rows = data.rows || [];

  if (rows.length === 0) {
    throw new Error(`${resource.label} API returned no rows`);
  }

  const missing = rows.filter((row) => !String(row.RawMD || row.rawMD || '').trim());
  if (missing.length > 0) {
    throw new Error(
      `${resource.label} API returned ${missing.length}/${rows.length} rows without RawMD: ` +
      missing.map((row) => `${row[resource.idField]}:${row.Name}`).join(', ')
    );
  }

  return {
    entity: resource.label,
    rowsChecked: rows.length,
    sample: rows.map((row) => ({
      id: row[resource.idField],
      name: row.Name,
      RawMDLength: String(row.RawMD || row.rawMD || '').length,
    })),
  };
}

async function main() {
  const results = [];

  for (const resource of resources) {
    results.push(await checkResource(resource));
  }

  console.log(JSON.stringify({
    apiRawMDCheck: true,
    apiBase: API_BASE,
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    apiRawMDCheck: false,
    error: error.message,
  }, null, 2));
  process.exitCode = 1;
});
