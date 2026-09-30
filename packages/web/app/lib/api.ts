import { createCookie } from "@remix-run/node";

export const API_BASE = process.env.API_BASE || "http://localhost:4000";

export const sessionCookie = createCookie("sl_token", {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 8,
  secrets: [process.env.COOKIE_SECRET || "dev-cookie-secret"],
});

export interface User {
  id: string;
  email: string;
  name: string;
  role: "customer" | "sales" | "legal" | "warehouse";
  company?: string | null;
}

export async function getUser(request: Request): Promise<User | null> {
  const token = await sessionCookie.parse(request.headers.get("Cookie"));
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user as User;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api(
  request: Request,
  path: string,
  options: { method?: string; body?: unknown } = {}
) {
  const token = await sessionCookie.parse(request.headers.get("Cookie"));
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (data as any).message || "请求失败");
  }
  return data;
}

export async function requireUser(request: Request, roles?: User["role"][]) {
  const user = await getUser(request);
  if (!user) {
    throw new Response(null, {
      status: 302,
      headers: { Location: "/login" },
    });
  }
  if (roles && !roles.includes(user.role)) {
    throw new Response(null, {
      status: 302,
      headers: { Location: "/dashboard" },
    });
  }
  return user;
}
