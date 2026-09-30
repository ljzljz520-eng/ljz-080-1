import type { FastifyInstance } from 'fastify';
import { query, withTx } from './db.js';
import { allowRoles } from './auth.js';
import { changeStatus, getFullLoan, httpError, projectByRole, syncReadyGate } from './loan-service.js';

export async function opsRoutes(app: FastifyInstance) {
  const auth = app.authenticate;
  const detail = (id: number) => getFullLoan(id);

  // ============ 押金（销售/管理员登记收款与退款） ============
  app.post('/api/loans/:id/deposit/pay', {
    preHandler: [auth, allowRoles('sales', 'admin')],
  }, async (req) => {
    const id = Number((req.params as any).id);
    const { method } = req.body as { method?: string };
    const full = await detail(id);
    if (!full.deposit) throw httpError(404, '押金记录不存在');
    if (full.deposit.status !== 'unpaid') throw httpError(409, '押金已登记过收款');
    await query(
      `UPDATE deposits SET status = 'paid', paid_at = now(), paid_method = $1,
         recorded_by = $2, updated_at = now() WHERE loan_id = $3`,
      [method?.trim() || '银行转账', req.user.id, id],
    );
    await syncReadyGate(id);
    return { loan: projectByRole(await detail(id), req.user) };
  });

  app.post('/api/loans/:id/deposit/refund', {
    preHandler: [auth, allowRoles('sales', 'admin')],
  }, async (req) => {
    const id = Number((req.params as any).id);
    const { deduct = 0, note } = req.body as { deduct?: number; note?: string };
    const full = await detail(id);
    if (!full.deposit || (full.deposit.status !== 'paid' && full.deposit.status !== 'partially_deducted')) {
      throw httpError(409, '当前押金状态不可退款');
    }
    if (Number(deduct) > full.deposit.amount) throw httpError(400, '扣款不能超过押金金额');
    const status = Number(deduct) > 0 ? 'partially_deducted' : 'refunded';
    await query(
      `UPDATE deposits SET status = $1, refunded_at = now(), refund_note = $2,
              updated_at = now() WHERE loan_id = $3`,
      [status, `扣款 ¥${deduct}。${note ?? ''}`.trim(), id],
    );
    return { loan: projectByRole(await detail(id), req.user) };
  });

  // ============ 合同 / 合规（仅法务可写） ============
  app.post('/api/loans/:id/contract/draft', {
    preHandler: [auth, allowRoles('legal', 'admin')],
  }, async (req) => {
    const id = Number((req.params as any).id);
    const { title, content, complianceNote } = req.body as Record<string, string>;
    if (!title || !content) throw httpError(400, '合同标题和正文必填');
    const full = await detail(id);
    if (!['pending_legal', 'rejected', 'drafted'].includes(full.contract?.status ?? '')) {
      throw httpError(409, '当前合同状态不能起草/修改');
    }
    await query(
      `UPDATE contracts SET status = 'drafted', title = $1, content = $2,
              compliance_note = $3, drafted_by = $4, drafted_at = now(),
              reject_reason = NULL, updated_at = now() WHERE loan_id = $5`,
      [title.trim(), content, complianceNote?.trim() ?? null, req.user.id, id],
    );
    return { loan: projectByRole(await detail(id), req.user) };
  });

  // 法务合规驳回（例如目的国受出口管制）
  app.post('/api/loans/:id/contract/reject', {
    preHandler: [auth, allowRoles('legal')],
  }, async (req) => {
    const id = Number((req.params as any).id);
    const { reason } = req.body as { reason?: string };
    if (!reason) throw httpError(400, '请填写合规驳回原因');
    const full = await detail(id);
    await query(
      `UPDATE contracts SET status = 'rejected', reject_reason = $1, updated_at = now()
        WHERE loan_id = $2`,
      [reason.trim(), id],
    );
    await query(
      `UPDATE loan_applications SET compliance_flag = 'hold', updated_at = now() WHERE id = $1`,
      [id],
    );
    await syncReadyGate(id);
    return { loan: projectByRole(await detail(id), req.user) };
  });

  // 法务解除合规暂扣
  app.post('/api/loans/:id/contract/clear', {
    preHandler: [auth, allowRoles('legal')],
  }, async (req) => {
    const id = Number((req.params as any).id);
    await query(
      `UPDATE loan_applications SET compliance_flag = 'cleared', updated_at = now() WHERE id = $1`,
      [id],
    );
    await syncReadyGate(id);
    return { loan: projectByRole(await detail(id), req.user) };
  });

  // 客户在线签署
  app.post('/api/loans/:id/contract/sign', {
    preHandler: [auth, allowRoles('customer')],
  }, async (req) => {
    const id = Number((req.params as any).id);
    const full = await detail(id);
    if (full.customer.id !== req.user.id) throw httpError(403, '只能签署自己的合同');
    if (full.contract?.status !== 'drafted') throw httpError(409, '合同尚不可签署');
    await query(
      `UPDATE contracts SET status = 'signed', signed_by = $1, signed_at = now(),
              updated_at = now() WHERE loan_id = $2`,
      [req.user.id, id],
    );
    await query(
      `UPDATE loan_applications SET compliance_flag = 'cleared', updated_at = now() WHERE id = $1`,
      [id],
    );
    await syncReadyGate(id);
    return { loan: projectByRole(await detail(id), req.user) };
  });

  // ============ 物流（仓库专属） ============
  app.post('/api/loans/:id/ship', {
    preHandler: [auth, allowRoles('warehouse')],
  }, async (req) => {
    const id = Number((req.params as any).id);
    const { carrier, trackingNo } = req.body as { carrier?: string; trackingNo?: string };
    if (!carrier || !trackingNo) throw httpError(400, '承运商和物流单号必填');
    const full = await detail(id);
    if (full.status !== 'ready') throw httpError(409, '只有「待发货」状态可以发货');
    await withTx(async (c) => {
      await c.query(
        `INSERT INTO shipments (loan_id, direction, carrier, tracking_no, created_by)
         VALUES ($1, 'outbound', $2, $3, $4)`,
        [id, carrier.trim(), trackingNo.trim(), req.user.id],
      );
      await c.query(`UPDATE sample_units SET status = 'on_loan' WHERE id = $1`, [full.unit!.id]);
    });
    await changeStatus(id, 'shipped', req.user.id, `仓库发货：${carrier} ${trackingNo}`);
    return { loan: projectByRole(await detail(id), req.user) };
  });

  app.post('/api/loans/:id/ship-outbound/deliver', {
    preHandler: [auth, allowRoles('warehouse')],
  }, async (req) => {
    const id = Number((req.params as any).id);
    const full = await detail(id);
    if (full.status !== 'shipped') throw httpError(409, '只有已发货状态可以登记签收');
    await query(
      `UPDATE shipments SET status = 'delivered', delivered_at = now()
        WHERE loan_id = $1 AND direction = 'outbound'`,
      [id],
    );
    await changeStatus(id, 'delivered', req.user.id, '客户签收');
    return { loan: projectByRole(await detail(id), req.user) };
  });

  // 客户开始试用
  app.post('/api/loans/:id/trial/start', {
    preHandler: [auth, allowRoles('customer')],
  }, async (req) => {
    const id = Number((req.params as any).id);
    const full = await detail(id);
    if (full.customer.id !== req.user.id) throw httpError(403, '无权操作');
    if (full.status !== 'delivered') throw httpError(409, '签收后才能开始试用');
    await changeStatus(id, 'in_trial', req.user.id, '开始试用测试');
    return { loan: projectByRole(await detail(id), req.user) };
  });

  // 客户提交试用反馈
  app.post('/api/loans/:id/feedback', {
    preHandler: [auth, allowRoles('customer')],
  }, async (req) => {
    const id = Number((req.params as any).id);
    const body = req.body as { rating?: number; usageSummary?: string; issues?: string; result?: string };
    if (!body.rating || !body.usageSummary) throw httpError(400, '评分和使用情况必填');
    const full = await detail(id);
    if (full.customer.id !== req.user.id) throw httpError(403, '无权操作');
    if (!['in_trial', 'overdue', 'return_shipped'].includes(full.status)) {
      throw httpError(409, '试用中才能提交反馈');
    }
    await query(
      `INSERT INTO trial_feedbacks (loan_id, rating, usage_summary, issues, result)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (loan_id) DO UPDATE SET
         rating = EXCLUDED.rating, usage_summary = EXCLUDED.usage_summary,
         issues = EXCLUDED.issues, result = EXCLUDED.result, submitted_at = now()`,
      [id, body.rating, body.usageSummary, body.issues ?? null, body.result ?? null],
    );
    return { loan: projectByRole(await detail(id), req.user) };
  });

  // 客户登记寄回
  app.post('/api/loans/:id/return-ship', {
    preHandler: [auth, allowRoles('customer')],
  }, async (req) => {
    const id = Number((req.params as any).id);
    const { carrier, trackingNo } = req.body as { carrier?: string; trackingNo?: string };
    if (!carrier || !trackingNo) throw httpError(400, '承运商和物流单号必填');
    const full = await detail(id);
    if (full.customer.id !== req.user.id) throw httpError(403, '无权操作');
    if (!['in_trial', 'overdue'].includes(full.status)) throw httpError(409, '试用中/逾期才能登记寄回');
    await query(
      `INSERT INTO shipments (loan_id, direction, carrier, tracking_no, created_by)
       VALUES ($1, 'return', $2, $3, $4)`,
      [id, carrier.trim(), trackingNo.trim(), req.user.id],
    );
    await changeStatus(id, 'return_shipped', req.user.id, `客户寄回：${carrier} ${trackingNo}`);
    return { loan: projectByRole(await detail(id), req.user) };
  });

  // 仓库确认收货
  app.post('/api/loans/:id/return-receive', {
    preHandler: [auth, allowRoles('warehouse')],
  }, async (req) => {
    const id = Number((req.params as any).id);
    const full = await detail(id);
    if (full.status !== 'return_shipped') throw httpError(409, '只有已寄回状态可以确认收货');
    await query(
      `UPDATE shipments SET status = 'delivered', delivered_at = now()
        WHERE loan_id = $1 AND direction = 'return'`,
      [id],
    );
    await changeStatus(id, 'returned', req.user.id, '仓库签收获归还');
    return { loan: projectByRole(await detail(id), req.user) };
  });

  // 仓库归还检验
  app.post('/api/loans/:id/inspect', {
    preHandler: [auth, allowRoles('warehouse')],
  }, async (req) => {
    const id = Number((req.params as any).id);
    const { result, conditionNote, deduction } = req.body as {
      result?: 'pass' | 'damage'; conditionNote?: string; deduction?: number;
    };
    if (result !== 'pass' && result !== 'damage') throw httpError(400, '请选择检验结果');
    const full = await detail(id);
    if (full.status !== 'returned') throw httpError(409, '收货后才能检验');
    await withTx(async (c) => {
      await c.query(
        `INSERT INTO return_inspections (loan_id, result, condition_note, checked_by, checked_at, deduction)
         VALUES ($1,$2,$3,$4, now(), $5)
         ON CONFLICT (loan_id) DO UPDATE SET
           result = EXCLUDED.result, condition_note = EXCLUDED.condition_note,
           checked_by = EXCLUDED.checked_by, checked_at = now(), deduction = EXCLUDED.deduction`,
        [id, result, conditionNote?.trim() ?? null, req.user.id, result === 'damage' ? Number(deduction ?? 0) : 0],
      );
      await c.query(`UPDATE sample_units SET status = $1 WHERE id = $2`,
        [result === 'pass' ? 'available' : 'maintenance', full.unit!.id]);
    });
    await changeStatus(id, 'inspected', req.user.id,
      result === 'pass' ? '检验完好，可入库' : `检验发现损坏，建议扣款 ¥${deduction ?? 0}`);
    return { loan: projectByRole(await detail(id), req.user) };
  });

  // 销售/管理员在检验完成后结单（退款后）
  app.post('/api/loans/:id/complete', {
    preHandler: [auth, allowRoles('sales', 'admin')],
  }, async (req) => {
    const id = Number((req.params as any).id);
    const full = await detail(id);
    if (full.status !== 'inspected') throw httpError(409, '检验完成后才能结单');
    await changeStatus(id, 'completed', req.user.id, '押金处理完毕，流程完结');
    return { loan: projectByRole(await detail(id), req.user) };
  });
}
