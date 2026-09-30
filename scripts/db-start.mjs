// 启动 embedded PostgreSQL（幂等）
import { spawnSync } from 'node:child_process';
import net from 'node:net';

const NATIVE = '/workspace/node_modules/@embedded-postgres/linux-arm64/native';
const DATA = '/workspace/.pgdata/data';
const PORT = Number(process.env.PGPORT ?? 5432);

function listening() {
  return new Promise((resolve) => {
    const s = net.createConnection({ path: '/tmp/.s.PGSQL.' + PORT }, () => { s.end(); resolve(true); });
    s.on('error', () => resolve(false));
  });
}

if (await listening()) { console.log('postgres already running'); process.exit(0); }

const r = spawnSync(`${NATIVE}/bin/pg_ctl`,
  ['-D', DATA, '-l', '/workspace/.pgdata/server.log', '-o', `-p ${PORT} -k /tmp`, 'start'],
  { env: { ...process.env, LD_LIBRARY_PATH: `${NATIVE}/lib` }, stdio: 'inherit' });
process.exit(r.status ?? 0);
