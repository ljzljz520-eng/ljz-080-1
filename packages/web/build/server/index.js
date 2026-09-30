var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable, createCookie, redirect, json } from "@remix-run/node";
import { RemixServer, Outlet, Meta, Links, ScrollRestoration, Scripts, useLoaderData, useActionData, useNavigation, Link, Form, useRouteLoaderData } from "@remix-run/react";
import * as isbotModule from "isbot";
import { renderToPipeableStream } from "react-dom/server";
const ABORT_DELAY = 5e3;
function handleRequest(request, responseStatusCode, responseHeaders, remixContext, loadContext) {
  let prohibitOutOfOrderStreaming = isBotRequest(request.headers.get("user-agent")) || remixContext.isSpaMode;
  return prohibitOutOfOrderStreaming ? handleBotRequest(
    request,
    responseStatusCode,
    responseHeaders,
    remixContext
  ) : handleBrowserRequest(
    request,
    responseStatusCode,
    responseHeaders,
    remixContext
  );
}
function isBotRequest(userAgent) {
  if (!userAgent) {
    return false;
  }
  if ("isbot" in isbotModule && typeof isbotModule.isbot === "function") {
    return isbotModule.isbot(userAgent);
  }
  if ("default" in isbotModule && typeof isbotModule.default === "function") {
    return isbotModule.default(userAgent);
  }
  return false;
}
function handleBotRequest(request, responseStatusCode, responseHeaders, remixContext) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(
        RemixServer,
        {
          context: remixContext,
          url: request.url,
          abortDelay: ABORT_DELAY
        }
      ),
      {
        onAllReady() {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        }
      }
    );
    setTimeout(abort, ABORT_DELAY);
  });
}
function handleBrowserRequest(request, responseStatusCode, responseHeaders, remixContext) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(
        RemixServer,
        {
          context: remixContext,
          url: request.url,
          abortDelay: ABORT_DELAY
        }
      ),
      {
        onShellReady() {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        }
      }
    );
    setTimeout(abort, ABORT_DELAY);
  });
}
const entryServer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: handleRequest
}, Symbol.toStringTag, { value: "Module" }));
const stylesheet = "/assets/app-DJ-iRgpW.css";
const links = () => [
  { rel: "stylesheet", href: stylesheet }
];
function Layout({ children }) {
  return /* @__PURE__ */ jsxs("html", { lang: "zh-CN", children: [
    /* @__PURE__ */ jsxs("head", { children: [
      /* @__PURE__ */ jsx("meta", { charSet: "utf-8" }),
      /* @__PURE__ */ jsx("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
      /* @__PURE__ */ jsx(Meta, {}),
      /* @__PURE__ */ jsx(Links, {})
    ] }),
    /* @__PURE__ */ jsxs("body", { children: [
      /* @__PURE__ */ jsx("div", { className: "app", children }),
      /* @__PURE__ */ jsx(ScrollRestoration, {}),
      /* @__PURE__ */ jsx(Scripts, {})
    ] })
  ] });
}
function App() {
  return /* @__PURE__ */ jsx(Outlet, {});
}
const route0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  Layout,
  default: App,
  links
}, Symbol.toStringTag, { value: "Module" }));
const API_BASE = process.env.API_BASE || "http://localhost:4000";
const sessionCookie = createCookie("sl_token", {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 8,
  secrets: [process.env.COOKIE_SECRET || "dev-cookie-secret"]
});
async function getUser(request) {
  const token = await sessionCookie.parse(request.headers.get("Cookie"));
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user;
  } catch {
    return null;
  }
}
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    __publicField(this, "status");
    this.status = status;
  }
}
async function api(request, path, options = {}) {
  const token = await sessionCookie.parse(request.headers.get("Cookie"));
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...token ? { Authorization: `Bearer ${token}` } : {}
    },
    body: options.body ? JSON.stringify(options.body) : void 0
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.message || "请求失败");
  }
  return data;
}
async function requireUser(request, roles) {
  const user = await getUser(request);
  if (!user) {
    throw new Response(null, {
      status: 302,
      headers: { Location: "/login" }
    });
  }
  if (roles && !roles.includes(user.role)) {
    throw new Response(null, {
      status: 302,
      headers: { Location: "/dashboard" }
    });
  }
  return user;
}
const STATUS_LABELS = {
  draft: "草稿",
  pending_sales: "待销售审核",
  pending_legal: "待法务合规",
  approved: "审核通过·待押金",
  deposit_paid: "押金已付·待发货",
  shipped: "已发货",
  in_trial: "试用中",
  return_shipped: "客户已寄回",
  returned: "仓库已签收",
  completed: "已完成",
  rejected: "已驳回",
  compliance_blocked: "合规拦截",
  overdue: "超期未还"
};
const ROLE_LABELS = {
  customer: "客户",
  sales: "销售",
  legal: "法务",
  warehouse: "仓库"
};
const EVENT_LABELS = {
  submitted: "提交申请",
  sales_approved: "销售审核通过",
  sales_rejected: "销售驳回",
  compliance_passed: "法务合规通过",
  compliance_blocked: "法务合规拦截",
  deposit_paid: "押金到账",
  shipped: "仓库发货",
  delivered: "客户签收",
  feedback: "试用反馈",
  return_shipped: "客户寄回",
  received: "仓库签收回件",
  inspected: "归还质检/押金结算"
};
function fmtDate(v) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("zh-CN", { timeZone: "UTC" });
}
function fmtDateTime(v) {
  if (!v) return "—";
  return new Date(v).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function statusColor(s) {
  if (["completed"].includes(s)) return "ok";
  if (["rejected", "compliance_blocked"].includes(s)) return "bad";
  if (["overdue"].includes(s)) return "warn";
  return "info";
}
async function loader$5({ request, params }) {
  const user = await getUser(request);
  const data = await api(request, `/applications/${params.id}`);
  return { ...data, user };
}
async function post(request, id, action2, body) {
  return api(request, `/applications/${id}/${action2}`, { method: "POST", body });
}
async function action$3({ request, params }) {
  const id = params.id;
  const form = await request.formData();
  const kind = String(form.get("_action"));
  const num = (k) => form.get(k) ? Number(form.get(k)) : void 0;
  const str = (k) => form.get(k) ? String(form.get(k)) : void 0;
  try {
    switch (kind) {
      case "sales_approve":
        await post(request, id, "sales-review", {
          decision: "approve",
          deposit_amount_usd: num("deposit_amount_usd"),
          comment: str("comment")
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
          compliance_notes: str("compliance_notes")
        });
        break;
      case "legal_block":
        await post(request, id, "legal-review", {
          decision: "block",
          compliance_notes: str("compliance_notes")
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
          refund_amount_usd: num("refund_amount_usd")
        });
        break;
    }
    return redirect(`/applications/${id}`);
  } catch (e) {
    return { error: e.message || "操作失败" };
  }
}
function Row({ k, v }) {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("dt", { children: k }),
    /* @__PURE__ */ jsx("dd", { children: v ?? "—" })
  ] });
}
function Timeline({ events }) {
  return /* @__PURE__ */ jsxs("div", { className: "card", children: [
    /* @__PURE__ */ jsx("h2", { children: "🕒 全流程时间线" }),
    /* @__PURE__ */ jsx("ul", { className: "timeline", children: events.map((e, i) => /* @__PURE__ */ jsxs("li", { children: [
      /* @__PURE__ */ jsxs("div", { className: "t-title", children: [
        EVENT_LABELS[e.event_type] || e.event_type,
        e.to_status && /* @__PURE__ */ jsx("span", { className: `badge ${statusColor(e.to_status)}`, style: { marginLeft: 8 }, children: STATUS_LABELS[e.to_status] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "t-meta", children: [
        fmtDateTime(e.created_at),
        " · ",
        e.actor_name || "系统",
        "（",
        ROLE_LABELS[e.actor_role] || e.actor_role,
        "）"
      ] }),
      e.detail && /* @__PURE__ */ jsx("div", { className: "t-detail", children: e.detail })
    ] }, i)) })
  ] });
}
function Hidden({ text }) {
  return /* @__PURE__ */ jsxs("div", { className: "section-hidden", children: [
    "🔒 ",
    text
  ] });
}
function ActionCard({ title, children }) {
  return /* @__PURE__ */ jsxs("div", { className: "card", children: [
    /* @__PURE__ */ jsx("h2", { children: title }),
    children
  ] });
}
function Detail() {
  const { application: a, events, feedbacks, user } = useLoaderData();
  const actionData = useActionData();
  const nav = useNavigation();
  const busy = nav.state === "submitting";
  const err = actionData && "error" in actionData ? actionData.error : null;
  const isOwner = user.role === "customer";
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "card", style: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }, children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx(Link, { to: "/dashboard", className: "muted", children: "← 返回列表" }),
        /* @__PURE__ */ jsxs("h2", { style: { margin: "6px 0 0", fontSize: 20 }, children: [
          a.code,
          /* @__PURE__ */ jsx("span", { className: `badge ${statusColor(a.status)}`, style: { marginLeft: 12, fontSize: 13 }, children: STATUS_LABELS[a.status] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "muted", children: [
        "提交于 ",
        fmtDateTime(a.created_at)
      ] })
    ] }),
    err && /* @__PURE__ */ jsx("div", { className: "error", children: err }),
    /* @__PURE__ */ jsxs("div", { className: "grid2", children: [
      /* @__PURE__ */ jsxs("div", { className: "card", children: [
        /* @__PURE__ */ jsx("h2", { children: "📄 申请信息" }),
        /* @__PURE__ */ jsxs("dl", { className: "kv", children: [
          /* @__PURE__ */ jsx(Row, { k: "样机", v: `${a.product_model} · ${a.product_name}` }),
          /* @__PURE__ */ jsx(Row, { k: "数量", v: `${a.quantity} 台` }),
          user.role !== "customer" && /* @__PURE__ */ jsx(Row, { k: "客户", v: `${a.customer_name}（${a.customer_company || "—"}）` }),
          /* @__PURE__ */ jsx(Row, { k: "目的国家", v: a.destination_country }),
          /* @__PURE__ */ jsx(Row, { k: "测试用途", v: a.test_purpose }),
          /* @__PURE__ */ jsx(Row, { k: "承诺寄回", v: fmtDate(a.return_date) }),
          a.remark != null && /* @__PURE__ */ jsx(Row, { k: "备注", v: a.remark }),
          a.sales_comment != null && /* @__PURE__ */ jsx(Row, { k: "销售意见", v: a.sales_comment })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "card", children: [
        /* @__PURE__ */ jsx("h2", { children: "⚖️ 合同与合规" }),
        user.role === "warehouse" ? /* @__PURE__ */ jsx(Hidden, { text: "合同与合规信息按权限不对仓库开放" }) : /* @__PURE__ */ jsxs("dl", { className: "kv", children: [
          /* @__PURE__ */ jsx(Row, { k: "合规状态", v: a.compliance_passed === true ? /* @__PURE__ */ jsx("span", { className: "badge ok", children: "已通过" }) : a.compliance_passed === false ? /* @__PURE__ */ jsx("span", { className: "badge bad", children: "已拦截" }) : /* @__PURE__ */ jsx("span", { className: "badge info", children: "待审核" }) }),
          /* @__PURE__ */ jsx(Row, { k: "合同编号", v: a.contract_no }),
          /* @__PURE__ */ jsx(Row, { k: "出口管制分类", v: a.export_classification }),
          /* @__PURE__ */ jsx(Row, { k: "合同条款摘要", v: a.contract_terms }),
          /* @__PURE__ */ jsx(Row, { k: "合规备注", v: a.compliance_notes })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "card", children: [
        /* @__PURE__ */ jsx("h2", { children: "💰 押金" }),
        user.role === "legal" ? /* @__PURE__ */ jsx(Hidden, { text: "押金金额属商务信息，法务视图中不展示" }) : /* @__PURE__ */ jsxs("dl", { className: "kv", children: [
          user.role !== "warehouse" && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Row, { k: "押金金额", v: a.deposit_amount_usd != null ? `USD ${a.deposit_amount_usd}` : "待销售设定" }),
            /* @__PURE__ */ jsx(Row, { k: "已到账时间", v: fmtDateTime(a.deposit_paid_at) }),
            a.deposit_refund_amount != null && /* @__PURE__ */ jsx(Row, { k: "退还金额", v: `USD ${a.deposit_refund_amount}` })
          ] }),
          /* @__PURE__ */ jsx(Row, { k: "押金状态", v: { unpaid: "未到账", paid: "已到账", refunded: "已全额退还", partially_refunded: "部分退还", forfeited: "已没收" }[a.deposit_status] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "card", children: [
        /* @__PURE__ */ jsx("h2", { children: "🚚 物流跟踪" }),
        user.role === "legal" ? /* @__PURE__ */ jsx(Hidden, { text: "物流信息按权限不对法务开放" }) : /* @__PURE__ */ jsxs("dl", { className: "kv", children: [
          /* @__PURE__ */ jsx(Row, { k: "发货承运商", v: a.outbound_carrier }),
          /* @__PURE__ */ jsx(Row, { k: "发货单号", v: a.outbound_tracking_no }),
          /* @__PURE__ */ jsx(Row, { k: "发货时间", v: fmtDateTime(a.shipped_at) }),
          /* @__PURE__ */ jsx(Row, { k: "签收时间", v: fmtDateTime(a.delivered_at) }),
          /* @__PURE__ */ jsx(Row, { k: "寄回承运商", v: a.inbound_carrier }),
          /* @__PURE__ */ jsx(Row, { k: "寄回单号", v: a.inbound_tracking_no }),
          /* @__PURE__ */ jsx(Row, { k: "仓库收件", v: fmtDateTime(a.return_received_at) })
        ] })
      ] })
    ] }),
    a.inspection_result && user.role !== "legal" && /* @__PURE__ */ jsxs("div", { className: "card", children: [
      /* @__PURE__ */ jsx("h2", { children: "🔍 归还质检" }),
      /* @__PURE__ */ jsxs("dl", { className: "kv", children: [
        /* @__PURE__ */ jsx(Row, { k: "质检结论", v: /* @__PURE__ */ jsx("span", { className: `badge ${a.inspection_result === "good" ? "ok" : "bad"}`, children: a.inspection_result === "good" ? "完好" : a.inspection_result === "damaged" ? "损坏" : "丢失" }) }),
        /* @__PURE__ */ jsx(Row, { k: "质检备注", v: a.inspection_notes }),
        /* @__PURE__ */ jsx(Row, { k: "质检时间", v: fmtDateTime(a.inspected_at) })
      ] })
    ] }),
    feedbacks !== void 0 && /* @__PURE__ */ jsxs("div", { className: "card", children: [
      /* @__PURE__ */ jsx("h2", { children: "💬 试用反馈" }),
      feedbacks.length === 0 && /* @__PURE__ */ jsx("div", { className: "muted", children: "暂无反馈" }),
      feedbacks.map((f) => /* @__PURE__ */ jsxs("div", { className: "feedback", children: [
        /* @__PURE__ */ jsxs("span", { className: "stars", children: [
          "★".repeat(f.rating),
          "☆".repeat(5 - f.rating)
        ] }),
        /* @__PURE__ */ jsx("span", { className: "muted", style: { marginLeft: 8 }, children: fmtDateTime(f.created_at) }),
        /* @__PURE__ */ jsx("div", { style: { marginTop: 6 }, children: f.content })
      ] }, f.id))
    ] }),
    user.role === "sales" && a.status === "pending_sales" && /* @__PURE__ */ jsxs("div", { className: "actions-grid", children: [
      /* @__PURE__ */ jsx(ActionCard, { title: "✅ 审核通过（设定押金后转法务）", children: /* @__PURE__ */ jsxs(Form, { method: "post", children: [
        /* @__PURE__ */ jsx("input", { type: "hidden", name: "_action", value: "sales_approve" }),
        /* @__PURE__ */ jsx("label", { children: "押金金额 USD *" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            name: "deposit_amount_usd",
            type: "number",
            min: 0,
            step: "0.01",
            defaultValue: Math.round(Number(a.product_unit_value || 0) * 0.3),
            required: true
          }
        ),
        /* @__PURE__ */ jsx("label", { children: "审核意见" }),
        /* @__PURE__ */ jsx("textarea", { name: "comment", placeholder: "如：同意借测，用于重点客户 POC" }),
        /* @__PURE__ */ jsx("div", { className: "btn-row", children: /* @__PURE__ */ jsx("button", { className: "btn success", disabled: busy, children: "审核通过" }) })
      ] }) }),
      /* @__PURE__ */ jsx(ActionCard, { title: "❌ 驳回申请", children: /* @__PURE__ */ jsxs(Form, { method: "post", children: [
        /* @__PURE__ */ jsx("input", { type: "hidden", name: "_action", value: "sales_reject" }),
        /* @__PURE__ */ jsx("label", { children: "驳回原因 *" }),
        /* @__PURE__ */ jsx("textarea", { name: "comment", placeholder: "请说明驳回原因，客户可见", required: true }),
        /* @__PURE__ */ jsx("div", { className: "btn-row", children: /* @__PURE__ */ jsx("button", { className: "btn danger", disabled: busy, children: "驳回" }) })
      ] }) })
    ] }),
    user.role === "sales" && a.status === "approved" && /* @__PURE__ */ jsxs(ActionCard, { title: "💰 确认押金到账", children: [
      /* @__PURE__ */ jsxs("div", { className: "notice", children: [
        "押金金额要求 USD ",
        a.deposit_amount_usd,
        "。客户付款到账后确认，仓库将收到发货任务。"
      ] }),
      /* @__PURE__ */ jsxs(Form, { method: "post", children: [
        /* @__PURE__ */ jsx("input", { type: "hidden", name: "_action", value: "deposit_paid" }),
        /* @__PURE__ */ jsx("div", { className: "btn-row", children: /* @__PURE__ */ jsxs("button", { className: "btn success", disabled: busy, children: [
          "确认押金 USD ",
          a.deposit_amount_usd,
          " 已到账"
        ] }) })
      ] })
    ] }),
    user.role === "legal" && a.status === "pending_legal" && /* @__PURE__ */ jsxs(ActionCard, { title: "⚖️ 合同与出口合规审查", children: [
      /* @__PURE__ */ jsxs(Form, { method: "post", children: [
        /* @__PURE__ */ jsx("input", { type: "hidden", name: "_action", value: "legal_pass" }),
        /* @__PURE__ */ jsxs("div", { className: "grid2", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { children: "合同编号 *" }),
            /* @__PURE__ */ jsx("input", { name: "contract_no", placeholder: "如 NDA-LN-2026-0091", required: true }),
            /* @__PURE__ */ jsx("label", { children: "出口管制分类 (ECCN/HS) *" }),
            /* @__PURE__ */ jsx("input", { name: "export_classification", placeholder: "如 EAR99 / 5A002", required: true })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { children: "合同关键条款摘要" }),
            /* @__PURE__ */ jsx("textarea", { name: "contract_terms", placeholder: "知识产权归属、禁止逆向、损耗赔偿条款…" }),
            /* @__PURE__ */ jsx("label", { children: "合规备注" }),
            /* @__PURE__ */ jsx("textarea", { name: "compliance_notes", placeholder: "目的国管制核查结论…" })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "btn-row", children: /* @__PURE__ */ jsx("button", { className: "btn success", disabled: busy, children: "合规通过（进入押金环节）" }) })
      ] }),
      /* @__PURE__ */ jsxs(Form, { method: "post", style: { marginTop: 12 }, children: [
        /* @__PURE__ */ jsx("input", { type: "hidden", name: "_action", value: "legal_block" }),
        /* @__PURE__ */ jsx("label", { children: "拦截原因 *" }),
        /* @__PURE__ */ jsx("textarea", { name: "compliance_notes", placeholder: "如：目的国受出口管制，需补充最终用户证明", required: true }),
        /* @__PURE__ */ jsx("div", { className: "btn-row", children: /* @__PURE__ */ jsx("button", { className: "btn danger", disabled: busy, children: "合规拦截" }) })
      ] })
    ] }),
    user.role === "warehouse" && a.status === "deposit_paid" && /* @__PURE__ */ jsxs(ActionCard, { title: "📦 安排发货", children: [
      /* @__PURE__ */ jsxs("div", { className: "notice", children: [
        "押金状态：",
        /* @__PURE__ */ jsx("strong", { children: "已到账" }),
        "，可发货至 ",
        a.destination_country,
        "。"
      ] }),
      /* @__PURE__ */ jsxs(Form, { method: "post", children: [
        /* @__PURE__ */ jsx("input", { type: "hidden", name: "_action", value: "ship" }),
        /* @__PURE__ */ jsxs("div", { className: "grid2", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { children: "承运商 *" }),
            /* @__PURE__ */ jsx("input", { name: "carrier", placeholder: "DHL / FedEx / 顺丰国际…", required: true })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { children: "物流单号 *" }),
            /* @__PURE__ */ jsx("input", { name: "tracking_no", placeholder: "运单号", required: true })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "btn-row", children: /* @__PURE__ */ jsx("button", { className: "btn", disabled: busy, children: "确认发货（扣减库存）" }) })
      ] })
    ] }),
    user.role === "warehouse" && a.status === "shipped" && /* @__PURE__ */ jsx(ActionCard, { title: "📬 客户签收确认", children: /* @__PURE__ */ jsxs(Form, { method: "post", children: [
      /* @__PURE__ */ jsx("input", { type: "hidden", name: "_action", value: "deliver" }),
      /* @__PURE__ */ jsx("div", { className: "btn-row", children: /* @__PURE__ */ jsx("button", { className: "btn", disabled: busy, children: "确认客户已签收，进入试用" }) })
    ] }) }),
    isOwner && ["in_trial", "overdue"].includes(a.status) && /* @__PURE__ */ jsxs("div", { className: "actions-grid", children: [
      /* @__PURE__ */ jsx(ActionCard, { title: "💬 提交试用反馈", children: /* @__PURE__ */ jsxs(Form, { method: "post", children: [
        /* @__PURE__ */ jsx("input", { type: "hidden", name: "_action", value: "feedback" }),
        /* @__PURE__ */ jsx("label", { children: "评分 *" }),
        /* @__PURE__ */ jsx("select", { name: "rating", defaultValue: "5", children: [5, 4, 3, 2, 1].map((n) => /* @__PURE__ */ jsxs("option", { value: n, children: [
          n,
          " 星"
        ] }, n)) }),
        /* @__PURE__ */ jsx("label", { children: "反馈内容 *" }),
        /* @__PURE__ */ jsx("textarea", { name: "content", placeholder: "测试环境、结果、问题或采购意向…", required: true }),
        /* @__PURE__ */ jsx("div", { className: "btn-row", children: /* @__PURE__ */ jsx("button", { className: "btn", disabled: busy, children: "提交反馈" }) })
      ] }) }),
      /* @__PURE__ */ jsx(ActionCard, { title: "↩️ 登记寄回物流", children: /* @__PURE__ */ jsxs(Form, { method: "post", children: [
        /* @__PURE__ */ jsx("input", { type: "hidden", name: "_action", value: "return_ship" }),
        /* @__PURE__ */ jsx("label", { children: "寄回承运商 *" }),
        /* @__PURE__ */ jsx("input", { name: "carrier", placeholder: "DHL / FedEx…", required: true }),
        /* @__PURE__ */ jsx("label", { children: "寄回单号 *" }),
        /* @__PURE__ */ jsx("input", { name: "tracking_no", required: true }),
        /* @__PURE__ */ jsx("div", { className: "btn-row", children: /* @__PURE__ */ jsx("button", { className: "btn warn", disabled: busy, children: "样机已寄出" }) })
      ] }) })
    ] }),
    isOwner && ["return_shipped", "returned", "completed"].includes(a.status) && /* @__PURE__ */ jsx(ActionCard, { title: "💬 补充试用反馈", children: /* @__PURE__ */ jsxs(Form, { method: "post", children: [
      /* @__PURE__ */ jsx("input", { type: "hidden", name: "_action", value: "feedback" }),
      /* @__PURE__ */ jsxs("div", { className: "grid2", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { children: "评分 *" }),
          /* @__PURE__ */ jsx("select", { name: "rating", defaultValue: "5", children: [5, 4, 3, 2, 1].map((n) => /* @__PURE__ */ jsxs("option", { value: n, children: [
            n,
            " 星"
          ] }, n)) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { children: "反馈内容 *" }),
          /* @__PURE__ */ jsx("input", { name: "content", placeholder: "补充试用体验总结", required: true })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "btn-row", children: /* @__PURE__ */ jsx("button", { className: "btn", disabled: busy, children: "提交反馈" }) })
    ] }) }),
    user.role === "warehouse" && a.status === "return_shipped" && /* @__PURE__ */ jsxs(ActionCard, { title: "📥 归还包裹签收", children: [
      /* @__PURE__ */ jsxs("div", { className: "notice", children: [
        "客户已通过 ",
        a.inbound_carrier,
        " 寄回，单号 ",
        a.inbound_tracking_no
      ] }),
      /* @__PURE__ */ jsxs(Form, { method: "post", children: [
        /* @__PURE__ */ jsx("input", { type: "hidden", name: "_action", value: "receive" }),
        /* @__PURE__ */ jsx("div", { className: "btn-row", children: /* @__PURE__ */ jsx("button", { className: "btn", disabled: busy, children: "确认签收并回补库存" }) })
      ] })
    ] }),
    user.role === "warehouse" && a.status === "returned" && /* @__PURE__ */ jsx(ActionCard, { title: "🔍 入库质检与押金结算", children: /* @__PURE__ */ jsxs(Form, { method: "post", children: [
      /* @__PURE__ */ jsx("input", { type: "hidden", name: "_action", value: "inspect" }),
      /* @__PURE__ */ jsxs("div", { className: "grid2", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { children: "质检结论 *" }),
          /* @__PURE__ */ jsxs("select", { name: "result", defaultValue: "good", children: [
            /* @__PURE__ */ jsx("option", { value: "good", children: "完好 — 建议全额退押金" }),
            /* @__PURE__ */ jsx("option", { value: "damaged", children: "损坏 — 建议部分扣除" }),
            /* @__PURE__ */ jsx("option", { value: "lost", children: "丢失 — 建议没收押金" })
          ] }),
          /* @__PURE__ */ jsx("label", { children: "建议退还金额 USD（损坏时填写）" }),
          /* @__PURE__ */ jsx("input", { name: "refund_amount_usd", type: "number", min: 0, step: "0.01", placeholder: "留空则默认退还 50%" })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { children: "质检备注" }),
          /* @__PURE__ */ jsx("textarea", { name: "notes", placeholder: "外观/功能检查情况、配件清单核对…" })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "btn-row", children: /* @__PURE__ */ jsx("button", { className: "btn success", disabled: busy, children: "完成质检并结算押金" }) })
    ] }) }),
    /* @__PURE__ */ jsx(Timeline, { events })
  ] });
}
const route1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$3,
  default: Detail,
  loader: loader$5
}, Symbol.toStringTag, { value: "Module" }));
async function loader$4({ request }) {
  await requireUser(request, ["customer"]);
  const { products } = await api(request, "/products");
  return { products };
}
async function action$2({ request }) {
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
        remark: String(form.get("remark") || "").trim()
      }
    });
    return redirect(`/applications/${application.id}`);
  } catch (e) {
    return { error: e.message || "提交失败" };
  }
}
const COUNTRIES = ["Germany", "United States", "Japan", "Singapore", "United Kingdom", "France", "Brazil", "India", "Thailand", "其他"];
function NewApplication() {
  const { products } = useLoaderData();
  const actionData = useActionData();
  const nav = useNavigation();
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  return /* @__PURE__ */ jsxs("div", { className: "card", style: { maxWidth: 680, margin: "0 auto" }, children: [
    /* @__PURE__ */ jsx("h2", { children: "📝 申请借用样机" }),
    /* @__PURE__ */ jsxs("div", { className: "muted", style: { marginBottom: 10 }, children: [
      "请如实填写",
      /* @__PURE__ */ jsx("strong", { children: "目的国家、测试用途、寄回日期" }),
      "，销售审核后将流转法务合规与仓库发货。"
    ] }),
    actionData && "error" in actionData && actionData.error && /* @__PURE__ */ jsx("div", { className: "error", children: actionData.error }),
    /* @__PURE__ */ jsxs(Form, { method: "post", children: [
      /* @__PURE__ */ jsx("label", { children: "样机型号 *" }),
      /* @__PURE__ */ jsxs("select", { name: "product_id", required: true, defaultValue: "", children: [
        /* @__PURE__ */ jsx("option", { value: "", disabled: true, children: "请选择…" }),
        products.map((p) => /* @__PURE__ */ jsxs("option", { value: p.id, disabled: p.stock_qty === 0, children: [
          p.model,
          " — ",
          p.name,
          "（库存 ",
          p.stock_qty,
          "）"
        ] }, p.id))
      ] }),
      /* @__PURE__ */ jsx("label", { children: "数量 *" }),
      /* @__PURE__ */ jsx("input", { name: "quantity", type: "number", min: 1, defaultValue: 1, required: true }),
      /* @__PURE__ */ jsx("label", { children: "目的国家/地区 *" }),
      /* @__PURE__ */ jsx("input", { name: "destination_country", list: "countries", placeholder: "如 Germany", required: true }),
      /* @__PURE__ */ jsx("datalist", { id: "countries", children: COUNTRIES.map((c) => /* @__PURE__ */ jsx("option", { value: c }, c)) }),
      /* @__PURE__ */ jsx("label", { children: "测试用途说明 *" }),
      /* @__PURE__ */ jsx("textarea", { name: "test_purpose", placeholder: "请说明客户现场做什么测试、预计测试周期、对接的客户/项目…", required: true }),
      /* @__PURE__ */ jsx("label", { children: "承诺寄回日期 *" }),
      /* @__PURE__ */ jsx("input", { name: "return_date", type: "date", min: today, required: true }),
      /* @__PURE__ */ jsx("label", { children: "备注（附件/配件需求等）" }),
      /* @__PURE__ */ jsx("textarea", { name: "remark", placeholder: "如：需要校准证书、定制线束…" }),
      /* @__PURE__ */ jsxs("div", { className: "btn-row", children: [
        /* @__PURE__ */ jsx("button", { className: "btn", disabled: nav.state === "submitting", children: nav.state === "submitting" ? "提交中…" : "提交申请" }),
        /* @__PURE__ */ jsx(Link, { className: "btn secondary", to: "/dashboard", children: "取消" })
      ] })
    ] })
  ] });
}
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$2,
  default: NewApplication,
  loader: loader$4
}, Symbol.toStringTag, { value: "Module" }));
async function loader$3({ request }) {
  const user = await getUser(request);
  const [{ applications }, { products }] = await Promise.all([
    api(request, "/applications"),
    api(request, "/products")
  ]);
  return { applications, products, user };
}
const HEADLINES = {
  customer: { title: "我的借测申请", hint: "提交申请后可在此追踪审核、押金、物流、反馈与归还的全流程" },
  sales: { title: "销售审核队列", hint: "审核客户的测试用途与目的国，设定押金金额；通过后自动转法务合规" },
  legal: { title: "法务合规队列", hint: "仅处理合同条款与出口管制合规，看不到押金金额与物流操作" },
  warehouse: { title: "仓库出入库任务", hint: "押金到账后发货；回收包裹签收、入库质检与押金结算建议" }
};
function Dashboard() {
  const { applications, products, user } = useLoaderData();
  const head = HEADLINES[user.role];
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "card", style: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }, children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h2", { style: { marginBottom: 4 }, children: head.title }),
        /* @__PURE__ */ jsx("div", { className: "muted", children: head.hint })
      ] }),
      user.role === "customer" && /* @__PURE__ */ jsx(Link, { className: "btn", to: "/applications/new", children: "+ 申请借样机" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "card", children: /* @__PURE__ */ jsxs("table", { children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { children: "单号" }),
        /* @__PURE__ */ jsx("th", { children: "样机" }),
        user.role !== "customer" && /* @__PURE__ */ jsx("th", { children: "客户" }),
        /* @__PURE__ */ jsx("th", { children: "目的国" }),
        /* @__PURE__ */ jsx("th", { children: "承诺寄回" }),
        /* @__PURE__ */ jsx("th", { children: "状态" }),
        /* @__PURE__ */ jsx("th", {})
      ] }) }),
      /* @__PURE__ */ jsxs("tbody", { children: [
        applications.length === 0 && /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 7, className: "muted", style: { textAlign: "center", padding: 28 }, children: "暂无数据" }) }),
        applications.map((a) => /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsx(Link, { to: `/applications/${a.id}`, children: /* @__PURE__ */ jsx("strong", { children: a.code }) }) }),
          /* @__PURE__ */ jsx("td", { children: a.product_model }),
          user.role !== "customer" && /* @__PURE__ */ jsxs("td", { children: [
            a.customer_name,
            a.customer_company ? /* @__PURE__ */ jsx("div", { className: "muted", children: a.customer_company }) : null
          ] }),
          /* @__PURE__ */ jsx("td", { children: a.destination_country }),
          /* @__PURE__ */ jsx("td", { children: fmtDate(a.return_date) }),
          /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsx("span", { className: `badge ${statusColor(a.status)}`, children: STATUS_LABELS[a.status] || a.status }) }),
          /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsx(Link, { to: `/applications/${a.id}`, children: "查看 →" }) })
        ] }, a.id))
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "card", children: [
      /* @__PURE__ */ jsx("h2", { children: "样机库存" }),
      /* @__PURE__ */ jsxs("table", { children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { children: "型号" }),
          /* @__PURE__ */ jsx("th", { children: "名称" }),
          /* @__PURE__ */ jsx("th", { children: "单价 (USD)" }),
          /* @__PURE__ */ jsx("th", { children: "可用库存" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: products.map((p) => /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsx("strong", { children: p.model }) }),
          /* @__PURE__ */ jsx("td", { children: p.name }),
          /* @__PURE__ */ jsx("td", { children: Number(p.unit_value_usd).toLocaleString() }),
          /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsxs("span", { className: `badge ${p.stock_qty === 0 ? "bad" : p.stock_qty <= 3 ? "warn" : "ok"}`, children: [
            p.stock_qty,
            " 台"
          ] }) })
        ] }, p.id)) })
      ] })
    ] })
  ] });
}
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: Dashboard,
  loader: loader$3
}, Symbol.toStringTag, { value: "Module" }));
async function loader$2({ request }) {
  const user = await getUser(request);
  throw redirect(user ? "/dashboard" : "/login");
}
const route4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$2
}, Symbol.toStringTag, { value: "Module" }));
async function action$1({}) {
  return redirect("/login", {
    headers: { "Set-Cookie": await sessionCookie.serialize("", { maxAge: 0 }) }
  });
}
async function loader$1() {
  return redirect("/login");
}
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$1,
  loader: loader$1
}, Symbol.toStringTag, { value: "Module" }));
async function action({ request }) {
  const form = await request.formData();
  const email = String(form.get("email") || "");
  const password = String(form.get("password") || "");
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) {
    return json({ error: data.message || "登录失败" }, { status: 401 });
  }
  return redirect("/dashboard", {
    headers: { "Set-Cookie": await sessionCookie.serialize(data.token) }
  });
}
function Login() {
  const actionData = useActionData();
  const nav = useNavigation();
  const accounts = [
    ["customer@demo.com", "客户"],
    ["sales@demo.com", "销售"],
    ["legal@demo.com", "法务"],
    ["warehouse@demo.com", "仓库"]
  ];
  return /* @__PURE__ */ jsxs("div", { className: "login-wrap", children: [
    /* @__PURE__ */ jsxs("div", { className: "logo", children: [
      /* @__PURE__ */ jsx("div", { style: { fontSize: 40 }, children: "🌍📦" }),
      /* @__PURE__ */ jsx("h1", { children: "跨境样品借测系统" }),
      /* @__PURE__ */ jsx("div", { className: "muted", children: "申请 · 审核 · 合规 · 押金 · 物流 · 反馈 · 归还" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "card", children: [
      (actionData == null ? void 0 : actionData.error) && /* @__PURE__ */ jsx("div", { className: "error", children: actionData.error }),
      /* @__PURE__ */ jsxs(Form, { method: "post", children: [
        /* @__PURE__ */ jsx("label", { children: "邮箱" }),
        /* @__PURE__ */ jsx("input", { name: "email", type: "email", placeholder: "you@company.com", required: true }),
        /* @__PURE__ */ jsx("label", { children: "密码" }),
        /* @__PURE__ */ jsx("input", { name: "password", type: "password", placeholder: "password123", required: true }),
        /* @__PURE__ */ jsx("div", { className: "btn-row", children: /* @__PURE__ */ jsx("button", { className: "btn", style: { width: "100%" }, disabled: nav.state === "submitting", children: nav.state === "submitting" ? "登录中…" : "登 录" }) })
      ] }),
      /* @__PURE__ */ jsx("h3", { children: "演示账号（密码均为 password123）" }),
      /* @__PURE__ */ jsx("table", { className: "demo-accounts", children: /* @__PURE__ */ jsx("tbody", { children: accounts.map(([email, role]) => /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsx("code", { children: email }) }),
        /* @__PURE__ */ jsx("td", { className: "muted", children: role })
      ] }, email)) }) })
    ] })
  ] });
}
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action,
  default: Login
}, Symbol.toStringTag, { value: "Module" }));
async function loader({ request }) {
  const user = await getUser(request);
  if (!user) throw redirect("/login");
  return { user };
}
function useUser() {
  return useRouteLoaderData("routes/_app").user;
}
function AppLayout() {
  const { user } = useRouteLoaderData("routes/_app");
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("header", { className: "topbar", children: [
      /* @__PURE__ */ jsx(Link, { to: "/dashboard", className: "brand", children: "🌍 跨境样品借测系统" }),
      /* @__PURE__ */ jsxs("div", { className: "who", children: [
        /* @__PURE__ */ jsx("span", { children: user.name }),
        /* @__PURE__ */ jsx("span", { className: "role-tag", children: ROLE_LABELS[user.role] }),
        /* @__PURE__ */ jsx(Form, { method: "post", action: "/logout", children: /* @__PURE__ */ jsx("button", { className: "btn secondary", style: { padding: "4px 12px" }, children: "退出" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "container", children: /* @__PURE__ */ jsx(Outlet, {}) })
  ] });
}
const route7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: AppLayout,
  loader,
  useUser
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-Cgt9USy_.js", "imports": ["/assets/components-3MROyUOD.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/root-DKJ_CmbY.js", "imports": ["/assets/components-3MROyUOD.js"], "css": [] }, "routes/_app.applications.$id": { "id": "routes/_app.applications.$id", "parentId": "routes/_app", "path": "applications/:id", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/_app.applications._id-DmMBnuvk.js", "imports": ["/assets/components-3MROyUOD.js", "/assets/format-C9N5R-P8.js"], "css": [] }, "routes/_app.applications.new": { "id": "routes/_app.applications.new", "parentId": "routes/_app", "path": "applications/new", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/_app.applications.new-B2JURwVU.js", "imports": ["/assets/components-3MROyUOD.js"], "css": [] }, "routes/_app.dashboard": { "id": "routes/_app.dashboard", "parentId": "routes/_app", "path": "dashboard", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/_app.dashboard-CqifPGwU.js", "imports": ["/assets/components-3MROyUOD.js", "/assets/format-C9N5R-P8.js"], "css": [] }, "routes/_index": { "id": "routes/_index", "parentId": "root", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/_index-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/logout": { "id": "routes/logout", "parentId": "root", "path": "logout", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/logout-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/login": { "id": "routes/login", "parentId": "root", "path": "login", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/login-LiCB421C.js", "imports": ["/assets/components-3MROyUOD.js"], "css": [] }, "routes/_app": { "id": "routes/_app", "parentId": "root", "path": void 0, "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/_app-YFVDbJ-b.js", "imports": ["/assets/components-3MROyUOD.js", "/assets/format-C9N5R-P8.js"], "css": [] } }, "url": "/assets/manifest-5cf11443.js", "version": "5cf11443" };
const mode = "production";
const assetsBuildDirectory = "build/client";
const basename = "/";
const future = { "v3_fetcherPersist": false, "v3_relativeSplatPath": false, "v3_throwAbortReason": false, "v3_routeConfig": false, "v3_singleFetch": false, "v3_lazyRouteDiscovery": false, "unstable_optimizeDeps": false };
const isSpaMode = false;
const publicPath = "/";
const entry = { module: entryServer };
const routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: route0
  },
  "routes/_app.applications.$id": {
    id: "routes/_app.applications.$id",
    parentId: "routes/_app",
    path: "applications/:id",
    index: void 0,
    caseSensitive: void 0,
    module: route1
  },
  "routes/_app.applications.new": {
    id: "routes/_app.applications.new",
    parentId: "routes/_app",
    path: "applications/new",
    index: void 0,
    caseSensitive: void 0,
    module: route2
  },
  "routes/_app.dashboard": {
    id: "routes/_app.dashboard",
    parentId: "routes/_app",
    path: "dashboard",
    index: void 0,
    caseSensitive: void 0,
    module: route3
  },
  "routes/_index": {
    id: "routes/_index",
    parentId: "root",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route4
  },
  "routes/logout": {
    id: "routes/logout",
    parentId: "root",
    path: "logout",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/login": {
    id: "routes/login",
    parentId: "root",
    path: "login",
    index: void 0,
    caseSensitive: void 0,
    module: route6
  },
  "routes/_app": {
    id: "routes/_app",
    parentId: "root",
    path: void 0,
    index: void 0,
    caseSensitive: void 0,
    module: route7
  }
};
export {
  serverManifest as assets,
  assetsBuildDirectory,
  basename,
  entry,
  future,
  isSpaMode,
  mode,
  publicPath,
  routes
};
