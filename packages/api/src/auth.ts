import crypto from 'node:crypto';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env, type Role } from './env.js';

export interface JwtUser {
  id: number;
  email: string;
  name: string;
  role: Role;
}

// ---------- 密码哈希（node:scrypt，无外部依赖） ----------
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === derived.length &&
    crypto.timingSafeEqual(expected, derived);
}

// ---------- Fastify 插件 ----------
export async function registerAuth(app: FastifyInstance) {
  await app.register(fastifyJwt, { secret: env.jwtSecret });

  app.decorate(
    'authenticate',
    async function (req: FastifyRequest, reply: FastifyReply) {
      try {
        await req.jwtVerify();
      } catch {
        reply.code(401).send({ error: '未登录或登录已失效' });
      }
    },
  );
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}

// 角色守卫：roles 为空表示任意已登录用户
export function allowRoles(...roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as JwtUser;
    if (roles.length > 0 && !roles.includes(user.role)) {
      reply.code(403).send({ error: '无权执行该操作' });
    }
  };
}

// 生成确定性演示密码哈希（seed 用）
export function fixedHash(password: string, saltHex: string): string {
  const derived = crypto.scryptSync(password, saltHex, 64).toString('hex');
  return `${saltHex}:${derived}`;
}
