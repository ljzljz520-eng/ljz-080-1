import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';

const routes: FastifyPluginAsync = async (app) => {
  app.post('/auth/login', async (req, reply) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      return reply.code(400).send({ error: 'bad_request', message: '请输入邮箱和密码' });
    }
    const { rows } = await pool.query(
      `SELECT id, email, password_hash, name, role, company FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return reply.code(401).send({ error: 'unauthorized', message: '邮箱或密码错误' });
    }
    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      company: user.company,
    };
    const token = app.jwt.sign(payload, { expiresIn: '8h' });
    return { token, user: payload };
  });

  app.get(
    '/auth/me',
    { preHandler: app.requireRole() },
    async (req) => ({ user: req.user })
  );
};

export default routes;
