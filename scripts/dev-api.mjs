// 开发模式：确保 Postgres 已启动，然后用 tsx watch 跑 API
import { spawnSync, spawn } from 'node:child_process';

// 1) 确保数据库在运行
spawnSync('node', ['scripts/db-start.mjs'], { stdio: 'inherit' });

// 2) tsx watch 启动 API
const proc = spawn(
  process.execPath,
  ['--import', 'tsx', '--watch', 'packages/api/src/server.ts'],
  { stdio: 'inherit', env: process.env },
);
proc.on('exit', (code) => process.exit(code ?? 0));
