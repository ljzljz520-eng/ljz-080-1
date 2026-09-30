import { LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { api, getUser } from "~/lib/api";
import { STATUS_LABELS, fmtDate, statusColor } from "~/lib/format";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = (await getUser(request))!;
  const [{ applications }, { products }] = await Promise.all([
    api(request, "/applications"),
    api(request, "/products"),
  ]);
  return { applications, products, user };
}

const HEADLINES: Record<string, { title: string; hint: string }> = {
  customer: { title: "我的借测申请", hint: "提交申请后可在此追踪审核、押金、物流、反馈与归还的全流程" },
  sales: { title: "销售审核队列", hint: "审核客户的测试用途与目的国，设定押金金额；通过后自动转法务合规" },
  legal: { title: "法务合规队列", hint: "仅处理合同条款与出口管制合规，看不到押金金额与物流操作" },
  warehouse: { title: "仓库出入库任务", hint: "押金到账后发货；回收包裹签收、入库质检与押金结算建议" },
};

export default function Dashboard() {
  const { applications, products, user } = useLoaderData<typeof loader>();
  const head = HEADLINES[user.role];

  return (
    <>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>{head.title}</h2>
          <div className="muted">{head.hint}</div>
        </div>
        {user.role === "customer" && <Link className="btn" to="/applications/new">+ 申请借样机</Link>}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>单号</th>
              <th>样机</th>
              {user.role !== "customer" && <th>客户</th>}
              <th>目的国</th>
              <th>承诺寄回</th>
              <th>状态</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {applications.length === 0 && (
              <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 28 }}>暂无数据</td></tr>
            )}
            {applications.map((a: any) => (
              <tr key={a.id}>
                <td><Link to={`/applications/${a.id}`}><strong>{a.code}</strong></Link></td>
                <td>{a.product_model}</td>
                {user.role !== "customer" && (
                  <td>{a.customer_name}{a.customer_company ? <div className="muted">{a.customer_company}</div> : null}</td>
                )}
                <td>{a.destination_country}</td>
                <td>{fmtDate(a.return_date)}</td>
                <td><span className={`badge ${statusColor(a.status)}`}>{STATUS_LABELS[a.status] || a.status}</span></td>
                <td><Link to={`/applications/${a.id}`}>查看 →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>样机库存</h2>
        <table>
          <thead>
            <tr><th>型号</th><th>名称</th><th>单价 (USD)</th><th>可用库存</th></tr>
          </thead>
          <tbody>
            {products.map((p: any) => (
              <tr key={p.id}>
                <td><strong>{p.model}</strong></td>
                <td>{p.name}</td>
                <td>{Number(p.unit_value_usd).toLocaleString()}</td>
                <td>
                  <span className={`badge ${p.stock_qty === 0 ? "bad" : p.stock_qty <= 3 ? "warn" : "ok"}`}>
                    {p.stock_qty} 台
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
