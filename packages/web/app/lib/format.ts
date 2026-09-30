export const STATUS_LABELS: Record<string, string> = {
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
  overdue: "超期未还",
};

export const ROLE_LABELS: Record<string, string> = {
  customer: "客户",
  sales: "销售",
  legal: "法务",
  warehouse: "仓库",
};

export const EVENT_LABELS: Record<string, string> = {
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
  inspected: "归还质检/押金结算",
};

export function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("zh-CN", { timeZone: "UTC" });
}
export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
export function statusColor(s: string): string {
  if (["completed"].includes(s)) return "ok";
  if (["rejected", "compliance_blocked"].includes(s)) return "bad";
  if (["overdue"].includes(s)) return "warn";
  return "info";
}
