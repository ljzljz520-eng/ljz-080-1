// 集中读取环境变量，带默认值，方便本地开发
export const env = {
  port: Number(process.env.API_PORT ?? 4000),
  host: process.env.API_HOST ?? '127.0.0.1',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://postgres@127.0.0.1:5432/sample_loan',
};
export type Role = 'customer' | 'sales' | 'warehouse' | 'legal' | 'admin';
