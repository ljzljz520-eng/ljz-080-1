import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgConfig } from '../src/pg-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pool = new pg.Pool(pgConfig());

await pool.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

const dir = join(__dirname, '..', 'migrations');
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
for (const file of files) {
  const done = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
  if (done.rowCount) { console.log(`skip  ${file}`); continue; }
  const sql = await readFile(join(dir, file), 'utf8');
  await pool.query(sql);
  await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
  console.log(`apply ${file}`);
}
await pool.end();
