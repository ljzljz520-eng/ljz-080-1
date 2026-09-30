import { ActionFunctionArgs, LoaderFunctionArgs, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { api, getUser } from "~/lib/api";
import {
  STATUS_LABELS, ROLE_LABELS, EVENT_LABELS,
  fmtDate, fmtDateTime, statusColor,
} from "~/lib/format";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = (await getUser(request))!;
  const data = await api(request, `/applications/${params.id}`);
  return { ...data, user };
}

async function post(request: Request, id: string, action: string, body: any) {
  return api(request, `/applications/${id}/${action}`, { method: "POST", body });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const id = params.id!;
  const form = await request.formData();
  const kind = String(form.get("_action"));
  const num = (k: string) => (form.get(k) ? Number(form.get(k)) : undefined);
  const str = (k: string) => (form.get(k) ? String(form.get(k)) : undefined);
  try {
    switch (kind) {
      case "sales_approve":
        await post(request, id, "sales-review", {
          decision: "approve",
          deposit_amount_usd: num("deposit_amount_usd"),
          comment: str("comment"),
        });
        break;
      case "sales_reject":
        await post(request, id, "sales-review", { decision: "reject", comment: str("comment") });
        break;
      case "legal_pass":
        await post(request, id, "legal-review", {
          decision: "pass",
          contract_no: str("contract_no"),
          contract_terms: str("contract_terms"),
          export_classification: str("export_classification"),
          compliance_notes: str("compliance_notes"),
        });
        break;
      case "legal_block":
        await post(request, id, "legal-review", {
          decision: "block",
          compliance_notes: str("compliance_notes"),
        });
        break;
      case "deposit_paid":
        await post(request, id, "deposit", {});
        break;
      case "ship":
        await post(request, id, "ship", { tracking_no: str("tracking_no"), carrier: str("carrier") });
        break;
      case "deliver":
        await post(request, id, "deliver", {});
        break;
      case "feedback":
        await post(request, id, "feedback", { rating: num("rating"), content: str("content") });
        break;
      case "return_ship":
        await post(request, id, "return-ship", { tracking_no: str("tracking_no"), carrier: str("carrier") });
        break;
      case "receive":
        await post(request, id, "receive", {});
        break;
      case "inspect":
        await post(request, id, "inspect", {
          result: str("result"),
          notes: str("notes"),
          refund_amount_usd: num("refund_amount_usd"),
        });
        break;
    }
    return redirect(`/applications/${id}`);
  } catch (e: any) {
    return { error: e.message || "操作失败" };
  }
}

// ---------- 小组件 ----------
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v ?? "—"}</dd>
    </>
  );
}

function Timeline({ events }: { events: any[] }) {
  return (
    <div className="card">
      <h2>🕒 全流程时间线</h2>
      <ul className="timeline">
        {events.map((e, i) => (
          <li key={i}>
            <div className="t-title">
              {EVENT_LABELS[e.event_type] || e.event_type}
              {e.to_status && (
                <span className={`badge ${statusColor(e.to_status)}`} style={{ marginLeft: 8 }}>
                  {STATUS_LABELS[e.to_status]}
                </span>
              )}
            </div>
            <div className="t-meta">
              {fmtDateTime(e.created_at)} · {e.actor_name || "系统"}（{ROLE_LABELS[e.actor_role] || e.actor_role}）
            </div>
            {e.detail && <div className="t-detail">{e.detail}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Hidden({ text }: { text: string }) {
  return <div className="section-hidden">🔒 {text}</div>;
}

function ActionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

// ---------- 主页面 ----------
export default function Detail() {
  const { application: a, events, feedbacks, user } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state === "submitting";
  const err = actionData && "error" in actionData ? actionData.error : null;

  const isOwner = user.role === "customer";

  return (
    <>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <Link to="/dashboard" className="muted">← 返回列表</Link>
          <h2 style={{ margin: "6px 0 0", fontSize: 20 }}>
            {a.code}
            <span className={`badge ${statusColor(a.status)}`} style={{ marginLeft: 12, fontSize: 13 }}>
              {STATUS_LABELS[a.status]}
            </span>
          </h2>
        </div>
        <div className="muted">提交于 {fmtDateTime(a.created_at)}</div>
      </div>

      {err && <div className="error">{err}</div>}

      <div className="grid2">
        {/* ---- 申请信息（各角色看到的字段不同） ---- */}
        <div className="card">
          <h2>📄 申请信息</h2>
          <dl className="kv">
            <Row k="样机" v={`${a.product_model} · ${a.product_name}`} />
            <Row k="数量" v={`${a.quantity} 台`} />
            {user.role !== "customer" && (
              <Row k="客户" v={`${a.customer_name}（${a.customer_company || "—"}）`} />
            )}
            <Row k="目的国家" v={a.destination_country} />
            <Row k="测试用途" v={a.test_purpose} />
            <Row k="承诺寄回" v={fmtDate(a.return_date)} />
            {a.remark != null && <Row k="备注" v={a.remark} />}
            {a.sales_comment != null && <Row k="销售意见" v={a.sales_comment} />}
          </dl>
        </div>

        {/* ---- 合同与合规：法务完整可见；销售/客户可见摘要；仓库不可见 ---- */}
        <div className="card">
          <h2>⚖️ 合同与合规</h2>
          {user.role === "warehouse" ? (
            <Hidden text="合同与合规信息按权限不对仓库开放" />
          ) : (
            <dl className="kv">
              <Row k="合规状态" v={
                a.compliance_passed === true ? <span className="badge ok">已通过</span>
                : a.compliance_passed === false ? <span className="badge bad">已拦截</span>
                : <span className="badge info">待审核</span>
              } />
              <Row k="合同编号" v={a.contract_no} />
              <Row k="出口管制分类" v={a.export_classification} />
              <Row k="合同条款摘要" v={a.contract_terms} />
              <Row k="合规备注" v={a.compliance_notes} />
            </dl>
          )}
        </div>

        {/* ---- 押金：法务不可见金额；仓库只看到账状态 ---- */}
        <div className="card">
          <h2>💰 押金</h2>
          {user.role === "legal" ? (
            <Hidden text="押金金额属商务信息，法务视图中不展示" />
          ) : (
            <dl className="kv">
              {user.role !== "warehouse" && (
                <>
                  <Row k="押金金额" v={a.deposit_amount_usd != null ? `USD ${a.deposit_amount_usd}` : "待销售设定"} />
                  <Row k="已到账时间" v={fmtDateTime(a.deposit_paid_at)} />
                  {a.deposit_refund_amount != null && (
                    <Row k="退还金额" v={`USD ${a.deposit_refund_amount}`} />
                  )}
                </>
              )}
              <Row k="押金状态" v={
                ({ unpaid: "未到账", paid: "已到账", refunded: "已全额退还", partially_refunded: "部分退还", forfeited: "已没收" } as Record<string, string>)[a.deposit_status]
              } />
            </dl>
          )}
        </div>

        {/* ---- 物流：法务不可见 ---- */}
        <div className="card">
          <h2>🚚 物流跟踪</h2>
          {user.role === "legal" ? (
            <Hidden text="物流信息按权限不对法务开放" />
          ) : (
            <dl className="kv">
              <Row k="发货承运商" v={a.outbound_carrier} />
              <Row k="发货单号" v={a.outbound_tracking_no} />
              <Row k="发货时间" v={fmtDateTime(a.shipped_at)} />
              <Row k="签收时间" v={fmtDateTime(a.delivered_at)} />
              <Row k="寄回承运商" v={a.inbound_carrier} />
              <Row k="寄回单号" v={a.inbound_tracking_no} />
              <Row k="仓库收件" v={fmtDateTime(a.return_received_at)} />
            </dl>
          )}
        </div>
      </div>

      {/* ---- 质检结果（法务不可见） ---- */}
      {a.inspection_result && user.role !== "legal" && (
        <div className="card">
          <h2>🔍 归还质检</h2>
          <dl className="kv">
            <Row k="质检结论" v={
              <span className={`badge ${a.inspection_result === "good" ? "ok" : "bad"}`}>
                {a.inspection_result === "good" ? "完好" : a.inspection_result === "damaged" ? "损坏" : "丢失"}
              </span>
            } />
            <Row k="质检备注" v={a.inspection_notes} />
            <Row k="质检时间" v={fmtDateTime(a.inspected_at)} />
          </dl>
        </div>
      )}

      {/* ---- 试用反馈（客户/销售可见） ---- */}
      {feedbacks !== undefined && (
        <div className="card">
          <h2>💬 试用反馈</h2>
          {feedbacks.length === 0 && <div className="muted">暂无反馈</div>}
          {feedbacks.map((f: any) => (
            <div className="feedback" key={f.id}>
              <span className="stars">{"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}</span>
              <span className="muted" style={{ marginLeft: 8 }}>{fmtDateTime(f.created_at)}</span>
              <div style={{ marginTop: 6 }}>{f.content}</div>
            </div>
          ))}
        </div>
      )}

      {/* ============ 角色操作面板 ============ */}

      {/* 销售：审核 */}
      {user.role === "sales" && a.status === "pending_sales" && (
        <div className="actions-grid">
          <ActionCard title="✅ 审核通过（设定押金后转法务）">
            <Form method="post">
              <input type="hidden" name="_action" value="sales_approve" />
              <label>押金金额 USD *</label>
              <input name="deposit_amount_usd" type="number" min={0} step="0.01"
                defaultValue={Math.round(Number(a.product_unit_value || 0) * 0.3)} required />
              <label>审核意见</label>
              <textarea name="comment" placeholder="如：同意借测，用于重点客户 POC" />
              <div className="btn-row"><button className="btn success" disabled={busy}>审核通过</button></div>
            </Form>
          </ActionCard>
          <ActionCard title="❌ 驳回申请">
            <Form method="post">
              <input type="hidden" name="_action" value="sales_reject" />
              <label>驳回原因 *</label>
              <textarea name="comment" placeholder="请说明驳回原因，客户可见" required />
              <div className="btn-row"><button className="btn danger" disabled={busy}>驳回</button></div>
            </Form>
          </ActionCard>
        </div>
      )}

      {/* 销售：登记押金到账 */}
      {user.role === "sales" && a.status === "approved" && (
        <ActionCard title="💰 确认押金到账">
          <div className="notice">押金金额要求 USD {a.deposit_amount_usd}。客户付款到账后确认，仓库将收到发货任务。</div>
          <Form method="post">
            <input type="hidden" name="_action" value="deposit_paid" />
            <div className="btn-row"><button className="btn success" disabled={busy}>确认押金 USD {a.deposit_amount_usd} 已到账</button></div>
          </Form>
        </ActionCard>
      )}

      {/* 法务：合规审核（只含合同+合规字段） */}
      {user.role === "legal" && a.status === "pending_legal" && (
        <ActionCard title="⚖️ 合同与出口合规审查">
          <Form method="post">
            <input type="hidden" name="_action" value="legal_pass" />
            <div className="grid2">
              <div>
                <label>合同编号 *</label>
                <input name="contract_no" placeholder="如 NDA-LN-2026-0091" required />
                <label>出口管制分类 (ECCN/HS) *</label>
                <input name="export_classification" placeholder="如 EAR99 / 5A002" required />
              </div>
              <div>
                <label>合同关键条款摘要</label>
                <textarea name="contract_terms" placeholder="知识产权归属、禁止逆向、损耗赔偿条款…" />
                <label>合规备注</label>
                <textarea name="compliance_notes" placeholder="目的国管制核查结论…" />
              </div>
            </div>
            <div className="btn-row">
              <button className="btn success" disabled={busy}>合规通过（进入押金环节）</button>
            </div>
          </Form>
          <Form method="post" style={{ marginTop: 12 }}>
            <input type="hidden" name="_action" value="legal_block" />
            <label>拦截原因 *</label>
            <textarea name="compliance_notes" placeholder="如：目的国受出口管制，需补充最终用户证明" required />
            <div className="btn-row"><button className="btn danger" disabled={busy}>合规拦截</button></div>
          </Form>
        </ActionCard>
      )}

      {/* 仓库：发货 */}
      {user.role === "warehouse" && a.status === "deposit_paid" && (
        <ActionCard title="📦 安排发货">
          <div className="notice">押金状态：<strong>已到账</strong>，可发货至 {a.destination_country}。</div>
          <Form method="post">
            <input type="hidden" name="_action" value="ship" />
            <div className="grid2">
              <div>
                <label>承运商 *</label>
                <input name="carrier" placeholder="DHL / FedEx / 顺丰国际…" required />
              </div>
              <div>
                <label>物流单号 *</label>
                <input name="tracking_no" placeholder="运单号" required />
              </div>
            </div>
            <div className="btn-row"><button className="btn" disabled={busy}>确认发货（扣减库存）</button></div>
          </Form>
        </ActionCard>
      )}

      {/* 仓库：确认签收 */}
      {user.role === "warehouse" && a.status === "shipped" && (
        <ActionCard title="📬 客户签收确认">
          <Form method="post">
            <input type="hidden" name="_action" value="deliver" />
            <div className="btn-row"><button className="btn" disabled={busy}>确认客户已签收，进入试用</button></div>
          </Form>
        </ActionCard>
      )}

      {/* 客户：试用反馈 + 寄回 */}
      {isOwner && ["in_trial", "overdue"].includes(a.status) && (
        <div className="actions-grid">
          <ActionCard title="💬 提交试用反馈">
            <Form method="post">
              <input type="hidden" name="_action" value="feedback" />
              <label>评分 *</label>
              <select name="rating" defaultValue="5">
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} 星</option>)}
              </select>
              <label>反馈内容 *</label>
              <textarea name="content" placeholder="测试环境、结果、问题或采购意向…" required />
              <div className="btn-row"><button className="btn" disabled={busy}>提交反馈</button></div>
            </Form>
          </ActionCard>
          <ActionCard title="↩️ 登记寄回物流">
            <Form method="post">
              <input type="hidden" name="_action" value="return_ship" />
              <label>寄回承运商 *</label>
              <input name="carrier" placeholder="DHL / FedEx…" required />
              <label>寄回单号 *</label>
              <input name="tracking_no" required />
              <div className="btn-row"><button className="btn warn" disabled={busy}>样机已寄出</button></div>
            </Form>
          </ActionCard>
        </div>
      )}

      {/* 客户在已寄回后仍可补反馈 */}
      {isOwner && ["return_shipped", "returned", "completed"].includes(a.status) && (
        <ActionCard title="💬 补充试用反馈">
          <Form method="post">
            <input type="hidden" name="_action" value="feedback" />
            <div className="grid2">
              <div>
                <label>评分 *</label>
                <select name="rating" defaultValue="5">
                  {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} 星</option>)}
                </select>
              </div>
              <div>
                <label>反馈内容 *</label>
                <input name="content" placeholder="补充试用体验总结" required />
              </div>
            </div>
            <div className="btn-row"><button className="btn" disabled={busy}>提交反馈</button></div>
          </Form>
        </ActionCard>
      )}

      {/* 仓库：签收回件 */}
      {user.role === "warehouse" && a.status === "return_shipped" && (
        <ActionCard title="📥 归还包裹签收">
          <div className="notice">客户已通过 {a.inbound_carrier} 寄回，单号 {a.inbound_tracking_no}</div>
          <Form method="post">
            <input type="hidden" name="_action" value="receive" />
            <div className="btn-row"><button className="btn" disabled={busy}>确认签收并回补库存</button></div>
          </Form>
        </ActionCard>
      )}

      {/* 仓库：质检 + 押金结算建议 */}
      {user.role === "warehouse" && a.status === "returned" && (
        <ActionCard title="🔍 入库质检与押金结算">
          <Form method="post">
            <input type="hidden" name="_action" value="inspect" />
            <div className="grid2">
              <div>
                <label>质检结论 *</label>
                <select name="result" defaultValue="good">
                  <option value="good">完好 — 建议全额退押金</option>
                  <option value="damaged">损坏 — 建议部分扣除</option>
                  <option value="lost">丢失 — 建议没收押金</option>
                </select>
                <label>建议退还金额 USD（损坏时填写）</label>
                <input name="refund_amount_usd" type="number" min={0} step="0.01" placeholder="留空则默认退还 50%" />
              </div>
              <div>
                <label>质检备注</label>
                <textarea name="notes" placeholder="外观/功能检查情况、配件清单核对…" />
              </div>
            </div>
            <div className="btn-row"><button className="btn success" disabled={busy}>完成质检并结算押金</button></div>
          </Form>
        </ActionCard>
      )}

      <Timeline events={events} />
    </>
  );
}
