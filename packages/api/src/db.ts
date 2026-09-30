import pg from 'pg';
// 本地默认走 embedded-postgres 的 unix socket (/tmp)；设置 DATABASE_URL 且指向非本机时走 TCP
function buildConfig(): pg.PoolConfig {
  const url = process.env.DATABASE_URL;
  if (url) {
    const u = new URL(url);
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
      return {
        host: '/tmp', port: Number(u.port || 5432),
        user: u.username || 'postgres',
        password: u.password || undefined,
        database: u.pathname.slice(1) || 'sample_loan',
      };
    }
    return { connectionString: url, max: 10 };
  }
  return { host: '/tmp', port: 5432, user: 'postgres', database: 'sample_loan', max: 10 };
}

export const pool = new pg.Pool(buildConfig());

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function withTx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
