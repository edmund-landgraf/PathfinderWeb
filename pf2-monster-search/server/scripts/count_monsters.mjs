import { getPool } from '../src/db.js';

const queries = {
  vwMonsterFull_total: 'SELECT COUNT(*) AS cnt FROM pf2.vwMonsterFull',
  isNpc_0: 'SELECT COUNT(*) AS cnt FROM pf2.vwMonsterFull WHERE IsNPC = 0',
  isNpc_1: 'SELECT COUNT(*) AS cnt FROM pf2.vwMonsterFull WHERE IsNPC = 1',
  isNpc_null: 'SELECT COUNT(*) AS cnt FROM pf2.vwMonsterFull WHERE IsNPC IS NULL',
  monster_table: 'SELECT COUNT(*) AS cnt FROM pf2.Monster',
  monster_isNpc_0: 'SELECT COUNT(*) AS cnt FROM pf2.Monster WHERE IsNPC = 0',
  monster_isNpc_1: 'SELECT COUNT(*) AS cnt FROM pf2.Monster WHERE IsNPC = 1',
  monster_isNpc_null: 'SELECT COUNT(*) AS cnt FROM pf2.Monster WHERE IsNPC IS NULL',
  in_table_not_view: `
    SELECT COUNT(*) AS cnt
    FROM pf2.Monster m
    WHERE NOT EXISTS (
      SELECT 1 FROM pf2.vwMonsterFull v WHERE v.MonsterId = m.MonsterId
    )
  `,
  isNpc_breakdown_view: `
    SELECT IsNPC, COUNT(*) AS cnt
    FROM pf2.vwMonsterFull
    GROUP BY IsNPC
    ORDER BY IsNPC
  `,
  isNpc_breakdown_table: `
    SELECT IsNPC, COUNT(*) AS cnt
    FROM pf2.Monster
    GROUP BY IsNPC
    ORDER BY IsNPC
  `
};

try {
  const pool = await getPool();

  for (const [label, sql] of Object.entries(queries)) {
    const result = await pool.request().query(sql);
    console.log(`\n${label}:`);
    console.table(result.recordset);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

process.exit(0);
