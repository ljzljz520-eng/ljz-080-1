import { Form, Link, useActionData, useNavigation } from '@remix-run/react';
import { json, type ActionFunctionArgs, redirect } from '@remix-run/node';
import { apiFetch } from '../api';
import { commitSession, getSession } from '../session';

const DEMO = [
  { role: '客户', email: 'liwei@demo.com' },
  { role: '销售', email: 'zhangna@demo.com' },
  { role: '仓库', email: 'wangfang@demo.com' },
  { role: '法务', email: 'chenmo@demo.com' },
  { role: '管理员', email: 'admin@demo.com' },
];

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  try {
    const res = await apiFetch<{ token: string; user: any }>('/api/auth/login', {
      method: 'POST', body: { email, password },
    });
    const session = await getSession(request.headers.get('Cookie'));
    session.set('token', res.token);
    session.set('user', res.user);
    return redirect('/', {
      headers: { 'Set-Cookie': await commitSession(session) },
    });
  } catch (e: any) {
    return json({ error: e.message ?? '登录失败' }, { status: 401 });
  }
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 34 }}>🌐</div>
          <h1 style={{ marginBottom: 4 }}>跨境样品借测系统</h1>
          <div className="muted">样机借测 · 销售审核 · 合同合规 · 物流押金全链路</div>
        </div>
        {actionData?.error && <div className="form-error">{actionData.error}</div>}
        <Form method="post">
          <label className="field">
            <span className="lbl">邮箱</span>
            <input name="email" type="email" required placeholder="name@company.com"
              defaultValue="liwei@demo.com" />
          </label>
          <label className="field">
            <span className="lbl">密码</span>
            <input name="password" type="password" required defaultValue="demo1234" />
          </label>
          <button className="btn" style={{ width: '100%' }} disabled={nav.state === 'submitting'}>
            {nav.state === 'submitting' ? '登录中…' : '登 录'}
          </button>
        </Form>
        <div className="demo-accounts">
          <div className="muted" style={{ marginBottom: 6 }}>演示账号（点击填充，密码均为 demo1234）</div>
          {DEMO.map((d) => (
            <div className="acc" key={d.email}
              onClick={() => {
                const f = document.querySelector('input[name=email]') as HTMLInputElement | null;
                if (f) { f.value = d.email; f.form?.querySelector('input[name=password]')?.setAttribute('value', 'demo1234'); }
              }}>
              <span>{d.role}</span><span className="mono">{d.email}</span>
            </div>
          ))}
          <div style={{ marginTop: 8, textAlign: 'center' }}>
            <Link to="/register">没有账号？客户自助注册 →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
