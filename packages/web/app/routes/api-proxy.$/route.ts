import type { LoaderFunctionArgs } from '@remix-run/node';
import { requireUser } from '../../api';

// 浏览器侧只读调用的轻量代理：自动带上 cookie 中的 JWT
// /api-proxy/loans/3/available-units -> API /api/loans/3/available-units
export async function loader({ params, request }: LoaderFunctionArgs) {
  const { token } = await requireUser(request);
  const path = '/api/' + (params['*'] ?? '');
  const incoming = new URL(request.url);
  const res = await fetch(`http://127.0.0.1:4000${path}${incoming.search}`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
  });
}
