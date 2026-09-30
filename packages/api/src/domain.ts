// ============================================================
// 业务领域常量：状态机 + 角色字段可见性
// ============================================================

export const STATUSES = [
  'draft', 'submitted', 'approved', 'ready',
  'shipped', 'delivered', 'in_trial',
  'return_shipped', 'returned', 'inspected', 'completed',
  'rejected', 'overdue', 'cancelled',
] as const;
export type LoanStatus = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  submitted: '待销售审核',
  approved: '审核通过·准备中',
  ready: '待仓库发货',
  shipped: '已发货',
  delivered: '客户已签收',
  in_trial: '试用中',
  return_shipped: '客户已寄回',
  returned: '仓库已收货',
  inspected: '归还检验完成',
  completed: '已完结',
  rejected: '审核驳回',
  overdue: '逾期未还',
  cancelled: '已取消',
};

// 允许的状态流转：from -> [to...]
export const TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['approved', 'rejected', 'cancelled'],
  approved: ['ready', 'cancelled'],
  ready: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: ['in_trial'],
  in_trial: ['return_shipped', 'overdue'],
  overdue: ['return_shipped'],
  return_shipped: ['returned'],
  returned: ['inspected'],
  inspected: ['completed'],
  rejected: ['draft'],
  cancelled: [],
  completed: [],
};

export function canTransition(from: string, to: string): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// 状态在时间线上的展示顺序（用于进度条）
export const FLOW_ORDER: LoanStatus[] = [
  'submitted', 'approved', 'ready', 'shipped', 'delivered',
  'in_trial', 'return_shipped', 'returned', 'inspected', 'completed',
];

// 哪些角色能看借用单
export const LOAN_READ_ROLES = ['customer', 'sales', 'warehouse', 'legal', 'admin'];

// 借用单字段可见性 —— 最小权限原则
// 法务只看合同/合规；仓库只看发货收货需要的信息
export type FieldRule = 'show' | 'hide';
const ALL_FIELDS = [
  'id', 'code', 'customer', 'product', 'unit',
  'destinationCountry', 'testPurpose', 'testPurposeDetail', 'expectedReturnDate',
  'status', 'statusLabel', 'sales', 'reviewNote', 'reviewedAt',
  'complianceFlag', 'deposit', 'contract', 'shipments',
  'feedback', 'inspection', 'timeline', 'gate',
  'createdAt',
] as const;
type FieldName = (typeof ALL_FIELDS)[number];

const CUSTOMER_VIEW: FieldName[] = [...ALL_FIELDS];
const SALES_VIEW: FieldName[] = [...ALL_FIELDS];
const ADMIN_VIEW: FieldName[] = [...ALL_FIELDS];
// 仓库：发货收货所需，看不到押金/合同金额等商务信息
const WAREHOUSE_VIEW: FieldName[] = [
  'id', 'code', 'customer', 'product', 'unit',
  'destinationCountry', 'expectedReturnDate',
  'status', 'statusLabel', 'shipments', 'inspection', 'gate', 'timeline', 'createdAt',
];
// 法务：合同与合规所需，看不到押金、物流、检验、反馈等
const LEGAL_VIEW: FieldName[] = [
  'id', 'code', 'customer', 'product',
  'destinationCountry', 'testPurpose', 'testPurposeDetail',
  'status', 'statusLabel', 'complianceFlag', 'contract', 'timeline', 'createdAt',
];

export const FIELD_VIEW: Record<string, FieldName[]> = {
  customer: CUSTOMER_VIEW,
  sales: SALES_VIEW,
  warehouse: WAREHOUSE_VIEW,
  legal: LEGAL_VIEW,
  admin: ADMIN_VIEW,
};

export function visibleFields(role: string): Set<string> {
  return new Set<string>(FIELD_VIEW[role] ?? []);
}
