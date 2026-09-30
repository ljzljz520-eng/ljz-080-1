import { createCookieSessionStorage } from '@remix-run/node';

// JWT 保存在 httpOnly cookie 中，前端 JS 无法读取
export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: '__session',
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secrets: ['web-cookie-secret-change-me'],
    secure: false,
    maxAge: 60 * 60 * 12,
  },
});

export const { getSession, commitSession, destroySession } = sessionStorage;
export type Role = 'customer' | 'sales' | 'warehouse' | 'legal' | 'admin';

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  company?: string | null;
}
