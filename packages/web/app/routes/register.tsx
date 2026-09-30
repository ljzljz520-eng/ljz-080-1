import { Form, Link, useActionData, useNavigation } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs } from '@remix-run/node';
import { apiFetch } from '../api';
import { commitSession, getSession } from '../session';

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  try {
    const res = await apiFetch<{ token: string; user: any }>('/api/auth/register', {
      method: 'POST',
      body: {
        email: String(form.get('email')), password: String(form.get('password')),
        name: String(form.get('name')), company: String(form.get('company') ?? ''),
      },
    });
    const session = await getSession(request.headers.get('Cookie'));
    session.set('token', res.token);
    session.set('user', res.user);
    return redirect('/', { headers: { 'Set-Cookie': await commitSession(session) } });
  } catch (e: any) {
    return json({ error: e.message }, { status: 400 });
  }
}

export default function Register() {
  const err = useActionData<typeof action>();
  const nav = useNavigation();
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1 style={{ textAlign: 'center' }}>客户注册</h1>
        <div className="muted" style={{ textAlign: 'center', marginBottom: 18 }}>注册后即可在线申请借用样机</div>
        {err?.error && <div className="form-error">{err.error}</div>}
        <Form method="post">
          <label className="field"><span className="lbl">姓名 *</span><input name="name" required /></label>
          <label className="field"><span className="lbl">公司</span><input name="company" /></label>
          <label className="field"><span className="lbl">邮箱 *</span><input name="email" type="email" required /></label>
          <label className="field"><span className="lbl">密码 *</span><input name="password" type="password" minLength={6} required />
            <span className="hint">至少 6 位</span></label>
          <button className="btn" style={{ width: '100%' }} disabled={nav.state === 'submitting'}>
            {nav.state === 'submitting' ? '提交中…' : '注册并登录'}
          </button>
        </Form>
        <div style={{ textAlign: 'center', marginTop: 14 }}><Link to="/login">已有账号，去登录</Link></div>
      </div>
    </div>
  );
}
