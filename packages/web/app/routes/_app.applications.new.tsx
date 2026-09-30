import { ActionFunctionArgs, LoaderFunctionArgs, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { api, requireUser } from "~/lib/api";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request, ["customer"]);
  const { products } = await api(request, "/products");
  return { products };
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  try {
    const { application } = await api(request, "/applications", {
      method: "POST",
      body: {
        product_id: form.get("product_id"),
        quantity: Number(form.get("quantity") || 1),
        destination_country: String(form.get("destination_country") || "").trim(),
        test_purpose: String(form.get("test_purpose") || "").trim(),
        return_date: form.get("return_date"),
        remark: String(form.get("remark") || "").trim(),
      },
    });
    return redirect(`/applications/${application.id}`);
  } catch (e: any) {
    return { error: e.message || "提交失败" };
  }
}

const COUNTRIES = ["Germany", "United States", "Japan", "Singapore", "United Kingdom", "France", "Brazil", "India", "Thailand", "其他"];

export default function NewApplication() {
  const { products } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="card" style={{ maxWidth: 680, margin: "0 auto" }}>
      <h2>📝 申请借用样机</h2>
      <div className="muted" style={{ marginBottom: 10 }}>
        请如实填写<strong>目的国家、测试用途、寄回日期</strong>，销售审核后将流转法务合规与仓库发货。
      </div>
      {actionData && "error" in actionData && actionData.error && <div className="error">{actionData.error}</div>}
      <Form method="post">
        <label>样机型号 *</label>
        <select name="product_id" required defaultValue="">
          <option value="" disabled>请选择…</option>
          {products.map((p: any) => (
            <option key={p.id} value={p.id} disabled={p.stock_qty === 0}>
              {p.model} — {p.name}（库存 {p.stock_qty}）
            </option>
          ))}
        </select>

        <label>数量 *</label>
        <input name="quantity" type="number" min={1} defaultValue={1} required />

        <label>目的国家/地区 *</label>
        <input name="destination_country" list="countries" placeholder="如 Germany" required />
        <datalist id="countries">
          {COUNTRIES.map((c) => <option key={c} value={c} />)}
        </datalist>

        <label>测试用途说明 *</label>
        <textarea name="test_purpose" placeholder="请说明客户现场做什么测试、预计测试周期、对接的客户/项目…" required />

        <label>承诺寄回日期 *</label>
        <input name="return_date" type="date" min={today} required />

        <label>备注（附件/配件需求等）</label>
        <textarea name="remark" placeholder="如：需要校准证书、定制线束…" />

        <div className="btn-row">
          <button className="btn" disabled={nav.state === "submitting"}>
            {nav.state === "submitting" ? "提交中…" : "提交申请"}
          </button>
          <Link className="btn secondary" to="/dashboard">取消</Link>
        </div>
      </Form>
    </div>
  );
}
