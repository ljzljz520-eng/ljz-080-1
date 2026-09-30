import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import type { AuthUser, Role } from './types.js';
import { pool } from './db.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import applicationRoutes from './routes/applications.js';
import actionRoutes from './routes/actions.js';
import opsRoutes from './routes/ops.js';

const app = Fastify({ logger: true });

app.register(jwt, { secret: process.env.JWT_SECRET || 'dev-secret-sample-loan-2026' });

app.decorate(
  'requireRole',
  (...roles: Role[]) =>
    async (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
      await req.jwtVerify();
      if (roles.length && !roles.includes(req.user.role)) {
        return reply.code(403).send({ error: 'forbidden', message: '无权执行该操作' });
      }
    }
);

// 统一的时间线记录
app.decorate('logEvent', async ({ client, applicationId, eventType, fromStatus, toStatus, actor, detail }) => {
  const c = client ?? pool;
  await c.query(
    `INSERT INTO application_events
       (application_id, event_type, from_status, to_status, actor_id, actor_role, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [applicationId, eventType, fromStatus ?? null, toStatus ?? null, actor.id, actor.role, detail ?? null]
  );
});

app.get('/health', async () => ({ ok: true }));

app.register(authRoutes, { prefix: '/api' });
app.register(productRoutes, { prefix: '/api' });
app.register(applicationRoutes, { prefix: '/api' });
app.register(actionRoutes, { prefix: '/api' });
app.register(opsRoutes, { prefix: '/api' });

app.setErrorHandler((err, _req, reply) => {
  app.log.error(err);
  const code = (err as any).statusCode || 400;
  reply.code(code >= 100 && code < 600 ? code : 400).send({
    error: err.code || 'error',
    message: err.message,
  });
});

const port = Number(process.env.PORT || 4000);
app.listen({ port, host: '0.0.0.0' }).then(() => {
  app.log.info(`API listening on :${port}`);
});
