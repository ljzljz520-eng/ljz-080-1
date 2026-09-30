import type { FastifyInstance } from 'fastify';
import { query } from './db.js';
import { hashPassword, verifyPassword, type JwtUser } from './auth.js';

export async function authRoutes(app: FastifyInstance) {
  // 登录
  app.post('/api/auth/login', async (req, reply) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) throw badRequest('邮箱和密码必填');
    const { rows } = await query<any>(
      'SELECT id, email, password_hash, name, company, role FROM users WHERE email = $1',
      [email.toLowerCase().trim()],
    );
    const u = rows[0];
    if (!u || !verifyPassword(password, u.password_hash)) {
      return reply.code(401).send({ error: '邮箱或密码错误' });
    }
    const payload: JwtUser = { id: u.id, email: u.email, name: u.name, role: u.role };
    return { token: app.jwt.sign(payload), user: { ...payload, company: u.company } };
  });

  // 客户自助注册（仅注册为 customer）
  app.post('/api/auth/register', async (req, reply) => {
    const { email, password, name, company } = req.body as Record<string, string>;
    if (!email || !password || !name) return reply.code(400).send({ error: '邮箱、密码、姓名必填' });
    const exists = await query('SELECT 1 FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (exists.rowCount) return reply.code(409).send({ error: '该邮箱已注册' });
    const { rows } = await query<{ id: number }>(
      `INSERT INTO users (email, password_hash, name, company, role)
       VALUES ($1, $2, $3, $4, 'customer') RETURNING id`,
      [email.toLowerCase().trim(), hashPassword(password), name.trim(), company?.trim() ?? null],
    );
    const user: JwtUser = { id: rows[0].id, email: email.toLowerCase().trim(), name: name.trim(), role: 'customer' };
    return reply.code(201).send({ token: app.jwt.sign(user), user: { ...user, company: company?.trim() ?? null } });
  });

  // 当前用户
  app.get('/api/auth/me', { preHandler: [app.authenticate] }, async (req) => {
    return { user: req.user };
  });
}

function badRequest(msg: string) {
  const e = new Error(msg) as Error & { statusCode: number };
  e.statusCode = 400;
  return e;
}
