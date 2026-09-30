import { Pool } from 'pg';

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://postgres@%2Ftmp/sample_loan',
});

export async function tx<T>(fn: (c: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
