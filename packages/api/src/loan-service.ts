import { query } from './db.js';
import { STATUS_LABEL, canTransition, visibleFields, type LoanStatus } from './domain.js';
import type { JwtUser } from './auth.js';

// 重新计算并落库状态（approved <-> ready 的发货门禁自动联动）
export async function syncReadyGate(loanId: number): Promise<LoanStatus> {
  const { rows } = await query(
    `SELECT la.status,
            la.unit_id,
            d.status  AS deposit_status,
            c.status  AS contract_status,
            la.compliance_flag
       FROM loan_applications la
       LEFT JOIN deposits d  ON d.loan_id = la.id
       LEFT JOIN contracts c ON c.loan_id = la.id
      WHERE la.id = $1`,
    [loanId],
  );
  const row = rows[0];
  if (!row) throw httpError(404, '借用单不存在');

  const gateOpen =
    row.unit_id != null &&
    row.deposit_status === 'paid' &&
    (row.contract_status === 'signed' || row.contract_status === 'not_required') &&
    row.compliance_flag !== 'hold';

  if (row.status === 'approved' && gateOpen) {
    await changeStatus(loanId, 'ready', null, '合同/押金/样机就绪，自动进入待发货');
    return 'ready';
  }
  if (row.status === 'ready' && !gateOpen) {
    await changeStatus(loanId, 'approved', null, '发货条件不再满足，退回准备中');
    return 'approved';
  }
  return row.status as LoanStatus;
}

export function httpError(status: number, message: string) {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = status;
  return err;
}

// 状态流转（带状态机校验 + 时间线记录），返回新状态
export async function changeStatus(
  loanId: number,
  to: LoanStatus,
  actorId: number | null,
  note?: string | null,
): Promise<LoanStatus> {
  const { rows } = await query<{ status: LoanStatus }>(
    'SELECT status FROM loan_applications WHERE id = $1 FOR UPDATE',
    [loanId],
  );
  if (rows.length === 0) throw httpError(404, '借用单不存在');
  const from = rows[0].status;
  if (from !== to && !canTransition(from, to)) {
    throw httpError(409, `当前状态「${STATUS_LABEL[from]}」不能变更为「${STATUS_LABEL[to]}」`);
  }
  await query(
    `UPDATE loan_applications SET status = $1, updated_at = now() WHERE id = $2`,
    [to, loanId],
  );
  if (from !== to) {
    await query(
      `INSERT INTO status_events (loan_id, from_status, to_status, actor_id, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [loanId, from, to, actorId, note ?? null],
    );
  }
  return to;
}

// ---------- 组装给前端的完整借用单视图 ----------
export async function getFullLoan(id: number) {
  const { rows } = await query(
    `SELECT la.*,
            p.model AS product_model, p.name AS product_name, p.category AS product_category,
            p.deposit_amount AS standard_deposit,
            u.name AS customer_name, u.company AS customer_company, u.email AS customer_email,
            s.name AS sales_name,
            su.serial_no AS unit_serial
       FROM loan_applications la
       JOIN products p ON p.id = la.product_id
       JOIN users u    ON u.id = la.customer_id
       LEFT JOIN users s ON s.id = la.sales_id
       LEFT JOIN sample_units su ON su.id = la.unit_id
      WHERE la.id = $1`,
    [id],
  );
  if (rows.length === 0) throw httpError(404, '借用单不存在');
  return hydrateLoan(rows[0]);
}

async function hydrateLoan(la: any) {
  const [dep, con, ships, fb, insp, events] = await Promise.all([
    query('SELECT * FROM deposits WHERE loan_id = $1', [la.id]),
    query('SELECT * FROM contracts WHERE loan_id = $1', [la.id]),
    query(
      `SELECT sh.*, u.name AS operator_name FROM shipments sh
       LEFT JOIN users u ON u.id = sh.created_by
       WHERE sh.loan_id = $1 ORDER BY sh.created_at`, [la.id]),
    query('SELECT * FROM trial_feedbacks WHERE loan_id = $1', [la.id]),
    query(
      `SELECT ri.*, u.name AS checker_name FROM return_inspections ri
       LEFT JOIN users u ON u.id = ri.checked_by WHERE ri.loan_id = $1`, [la.id]),
    query(
      `SELECT se.*, u.name AS actor_name FROM status_events se
       LEFT JOIN users u ON u.id = se.actor_id
       WHERE se.loan_id = $1 ORDER BY se.created_at, se.id`, [la.id]),
  ]);

  const deposit = dep.rows[0] ?? null;
  const contract = con.rows[0] ?? null;
  const gate = {
    unitAssigned: la.unit_id != null,
    depositPaid: deposit?.status === 'paid',
    contractSigned:
      contract?.status === 'signed' || contract?.status === 'not_required',
    complianceCleared: la.compliance_flag !== 'hold',
  };
  (gate as any).ready = Object.values(gate).every(Boolean);

  return {
    id: la.id,
    code: la.code,
    customer: { id: la.customer_id, name: la.customer_name, company: la.customer_company, email: la.customer_email },
    product: { id: la.product_id, model: la.product_model, name: la.product_name, category: la.product_category, standardDeposit: Number(la.standard_deposit) },
    unit: la.unit_id ? { id: la.unit_id, serialNo: la.unit_serial } : null,
    destinationCountry: la.destination_country,
    testPurpose: la.test_purpose,
    testPurposeDetail: la.test_purpose_detail,
    expectedReturnDate: la.expected_return_date.toISOString().slice(0, 10),
    status: la.status,
    statusLabel: STATUS_LABEL[la.status],
    sales: la.sales_id ? { id: la.sales_id, name: la.sales_name } : null,
    reviewNote: la.review_note,
    reviewedAt: la.reviewed_at,
    complianceFlag: la.compliance_flag,
    deposit: deposit ? {
      id: deposit.id, amount: Number(deposit.amount), status: deposit.status,
      statusLabel: DEPOSIT_LABEL[deposit.status], paidAt: deposit.paid_at,
      paidMethod: deposit.paid_method, refundedAt: deposit.refunded_at, refundNote: deposit.refund_note,
    } : null,
    contract: contract ? {
      id: contract.id, status: contract.status,
      statusLabel: CONTRACT_LABEL[contract.status],
      title: contract.title, content: contract.content,
      complianceNote: contract.compliance_note,
      draftedAt: contract.drafted_at, signedAt: contract.signed_at, rejectReason: contract.reject_reason,
    } : null,
    shipments: ships.rows.map((s) => ({
      id: s.id, direction: s.direction,
      directionLabel: s.direction === 'outbound' ? '出库发货' : '归还寄回',
      carrier: s.carrier, trackingNo: s.tracking_no, status: s.status,
      statusLabel: s.status === 'delivered' ? '已签收' : '运输中',
      operatorName: s.operator_name, createdAt: s.created_at, deliveredAt: s.delivered_at,
    })),
    feedback: fb.rows[0] ?? null,
    inspection: insp.rows[0] ? {
      id: insp.rows[0].id, result: insp.rows[0].result,
      resultLabel: insp.rows[0].result === 'pass' ? '完好' : insp.rows[0].result === 'damage' ? '有损坏' : '待检验',
      conditionNote: insp.rows[0].condition_note,
      checkerName: insp.rows[0].checker_name, checkedAt: insp.rows[0].checked_at,
      deduction: Number(insp.rows[0].deduction),
    } : null,
    timeline: events.rows.map((e) => ({
      from: e.from_status, to: e.to_status,
      toLabel: STATUS_LABEL[e.to_status], actorName: e.actor_name ?? '系统',
      note: e.note, at: e.created_at,
    })),
    gate,
    createdAt: la.created_at,
  };
}

const DEPOSIT_LABEL: Record<string, string> = {
  unpaid: '未支付', paid: '已支付', refunded: '已退还', partially_deducted: '部分扣款后退还',
};
const CONTRACT_LABEL: Record<string, string> = {
  not_required: '无需合同', pending_legal: '待法务起草', drafted: '待客户签署', signed: '已签署', rejected: '合规驳回',
};

// 按角色裁剪字段（最小可见）
export function projectByRole(loan: ReturnType<typeof stripMeta>, user: JwtUser) {
  const allowed = visibleFields(user.role);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(loan)) {
    if (allowed.has(key)) out[key] = (loan as any)[key];
  }
  // 客户只能看自己的单（列表查询已过滤，这里兜底）
  if (user.role === 'customer' && (loan as any).customer?.id !== user.id) {
    throw httpError(403, '无权查看该借用单');
  }
  return out;
}
function stripMeta(x: any) { return x; }
export type FullLoan = Awaited<ReturnType<typeof getFullLoan>>;

// 列表摘要（不加载全部明细）
export async function listLoans(opts: {
  user: JwtUser; status?: string; q?: string;
}): Promise<FullLoan[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (opts.user.role === 'customer') {
    params.push(opts.user.id);
    conds.push(`la.customer_id = $${params.length}`);
  }
  if (opts.status) {
    params.push(opts.status);
    conds.push(`la.status = $${params.length}`);
  }
  if (opts.q) {
    params.push(`%${opts.q}%`);
    conds.push(`(la.code ILIKE $${params.length} OR p.model ILIKE $${params.length} OR u.name ILIKE $${params.length})`);
  }
  // 法务/仓库也允许看列表（投影时自动裁掉无权字段）
  const { rows } = await query(
    `SELECT la.id FROM loan_applications la
     JOIN products p ON p.id = la.product_id
     JOIN users u ON u.id = la.customer_id
     ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
     ORDER BY la.created_at DESC LIMIT 200`,
    params,
  );
  const loans: FullLoan[] = [];
  for (const r of rows) {
    const full = await getFullLoan(r.id);
    loans.push(projectByRole(full, opts.user) as FullLoan);
  }
  return loans;
}
