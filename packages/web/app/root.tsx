import {
  Links, Meta, Outlet, Scripts, ScrollRestoration,
  useLoaderData, Form, NavLink, useNavigation,
} from '@remix-run/react';
import { json, type LoaderFunctionArgs, redirect } from '@remix-run/node';
import { getUser } from './api';
import { destroySession, getSession, type Role, type SessionUser } from './session';
import stylesheet from './styles.css?url';
import { LinksFunction } from '@remix-run/node';

export const links: LinksFunction = () => [{ rel: 'stylesheet', href: stylesheet }];

const ROLE_LABEL: Record<Role, string> = {
  customer: '客户', sales: '销售', warehouse: '仓库', legal: '法务', admin: '管理员',
};

interface NavItem { to: string; label: string; icon: string; roles: Role[]; }
const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: '工作台',
    items: [
      { to: '/', label: '概览首页', icon: '🏠', roles: ['customer', 'sales', 'warehouse', 'legal', 'admin'] },
    ],
  },
  {
    title: '借测业务',
    items: [
      { to: '/loans/new', label: '申请借样机', icon: '📝', roles: ['customer'] },
      { to: '/loans', label: '我的借用单', icon: '📦', roles: ['customer'] },
      { to: '/sales/review', label: '待审申请', icon: '✅', roles: ['sales', 'admin'] },
      { to: '/loans', label: '全部借用单', icon: '📋', roles: ['sales', 'admin'] },
      { to: '/warehouse', label: '发货 / 收货', icon: '🚚', roles: ['warehouse'] },
      { to: '/legal', label: '合同与合规', icon: '⚖️', roles: ['legal'] },
    ],
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const ctx = await getUser(request);
  const path = new URL(request.url).pathname;
  if (!ctx && !['/login'].includes(path)) throw redirect('/login');
  if (ctx && path === '/login') throw redirect('/');
  return json({ user: ctx?.user ?? null });
}

export async function action({ request }: LoaderFunctionArgs) {
  const session = await getSession(request.headers.get('Cookie'));
  return redirect('/login', {
    headers: { 'Set-Cookie': await destroySession(session) },
  });
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useLoaderData<typeof loader>() ?? {};
  const navigation = useNavigation();
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {navigation.state === 'loading' ? null : null}
        {user ? <Shell user={user}>{children}</Shell> : children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function Shell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="logo">🌐</span>跨境样品借测</div>
        <nav>
          {NAV.map((group) => {
            const items = group.items.filter((i) => i.roles.includes(user.role));
            if (!items.length) return null;
            return (
              <div className="nav-group" key={group.title}>
                <div className="group-title">{group.title}</div>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
                  >
                    <span className="ico">{item.icon}</span>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="user-box">
          <div className="name">{user.name}</div>
          <div className="meta">{user.email}</div>
          <span className={'role-badge ' + user.role}>{ROLE_LABEL[user.role]}</span>
          <Form method="post" style={{ marginTop: 12 }}>
            <button className="btn secondary sm" style={{ width: '100%' }}>退出登录</button>
          </Form>
        </div>
      </aside>
      <div className="main">
        <div className="content">{children}</div>
      </div>
    </div>
  );
}

export default function App() {
  return <Outlet />;
}
