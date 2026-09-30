import Fastify from 'fastify';
import { env } from './env.js';
import { registerAuth } from './auth.js';
import { authRoutes } from './routes-auth.js';
import { productRoutes } from './routes-products.js';
import { loanRoutes } from './routes-loans.js';
import { opsRoutes } from './routes-ops.js';

const app = Fastify({ logger: true });

// 统一错误输出（中文）
app.setErrorHandler((error: any, _req, reply) => {
  const status = error.statusCode ?? 500;
  if (status >= 500) app.log.error(error);
  reply.status(status).send({
    error: error.message || '服务器内部错误',
    ...(error.validation ? { detail: '请求参数不合法' } : {}),
  });
});

app.get('/api/health', async () => ({ ok: true, service: 'sample-loan-api' }));

await registerAuth(app);
await app.register(authRoutes);
await app.register(productRoutes);
await app.register(loanRoutes);
await app.register(opsRoutes);

await app.listen({ port: env.port, host: env.host });
app.log.info(`API listening on http://${env.host}:${env.port}`);
