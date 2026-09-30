import { ActionFunctionArgs, redirect, json } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import { API_BASE, sessionCookie } from "~/lib/api";

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") || "");
  const password = String(form.get("password") || "");
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    return json({ error: data.message || "登录失败" }, { status: 401 });
  }
  return redirect("/dashboard", {
    headers: { "Set-Cookie": await sessionCookie.serialize(data.token) },
  });
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const accounts = [
    ["customer@demo.com", "客户"],
    ["sales@demo.com", "销售"],
    ["legal@demo.com", "法务"],
    ["warehouse@demo.com", "仓库"],
  ];
  return (
    <div className="login-wrap">
      <div className="logo">
        <div style={{ fontSize: 40 }}>🌍📦</div>
        <h1>跨境样品借测系统</h1>
        <div className="muted">申请 · 审核 · 合规 · 押金 · 物流 · 反馈 · 归还</div>
      </div>
      <div className="card">
        {actionData?.error && <div className="error">{actionData.error}</div>}
        <Form method="post">
          <label>邮箱</label>
          <input name="email" type="email" placeholder="you@company.com" required />
          <label>密码</label>
          <input name="password" type="password" placeholder="password123" required />
          <div className="btn-row">
            <button className="btn" style={{ width: "100%" }} disabled={nav.state === "submitting"}>
              {nav.state === "submitting" ? "登录中…" : "登 录"}
            </button>
          </div>
        </Form>
        <h3>演示账号（密码均为 password123）</h3>
        <table className="demo-accounts">
          <tbody>
            {accounts.map(([email, role]) => (
              <tr key={email}>
                <td><code>{email}</code></td>
                <td className="muted">{role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
