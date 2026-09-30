// 统一 PostgreSQL 连接配置（ESM，供 .mjs 脚本与 TS 共用思路）
// 本地 embedded-postgres：unix socket /tmp；可用 DATABASE_URL 覆盖为 TCP
export function pgConfig() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const u = new URL(url);
    // @127.0.0.1 / @localhost 视为本地，走 embedded postgres 的 unix socket
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
      return { host: '/tmp', port: 5432, user: u.username || 'postgres', database: u.pathname.slice(1) || 'sample_loan', password: u.password || undefined };
    }
    return { connectionString: url };
  }
  return { host: '/tmp', port: 5432, user: 'postgres', database: 'sample_loan' };
}
