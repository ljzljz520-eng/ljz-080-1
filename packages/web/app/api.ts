import type { SessionUser } from './session';

const API_BASE = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// 服务端调用 Fastify；token 来自 cookie session
export async function apiFetch<T = any>(
  path: string,
  opts: { token?: string | null; method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const url = new URL(API_BASE + path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v) url.searchParams.set(k, v);
    }
  }
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error || `请求失败 (${res.status})`);
  return json as T;
}

// 从请求里解析当前登录用户
export async function getUser(request: Request): Promise<{ user: SessionUser; token: string } | null> {
  const { getSession } = await import('./session');
  const session = await getSession(request.headers.get('Cookie'));
  const user = session.get('user') as SessionUser | undefined;
  const token = session.get('token') as string | undefined;
  if (!user || !token) return null;
  return { user, token };
}

export async function requireUser(request: Request) {
  const ctx = await getUser(request);
  if (!ctx) throw new Response(null, { status: 302, headers: { Location: '/login' } });
  return ctx;
}
