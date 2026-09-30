import type { FastifyPluginAsync } from 'fastify';
import { pool, tx } from '../db.js';
import type { AuthUser } from '../types.js';

const routes: FastifyPluginAsync = async (app) => {
  async function load(id: string) {
    const { rows } = await pool.query('SELECT * FROM loan_applications WHERE id = $1', [id]);
    return rows[0];
  }
  function expect(status: string, allowed: string[]) {
    if (!allowed.includes(status)) {
      const err = new Error(`当前状态 [${status}] 不允许该操作`) as Error & { statusCode: number };
      err.statusCode = 409;
      throw err;
    }
  }

  // ---------------- 销售审核 ----------------
  app.post('/applications/:id/sales-review', {
    preHandler: app.requireRole('sales'),
  }, async (req, reply) => {
    const user = req.user as AuthUser;
    const b = req.body as Record<string, any>;
    const a = await load((req.params as any).id);
    if (!a) return reply.code(404).send({ error: 'not_found', message: '申请单不存在' });
    expect(a.status, ['pending_sales']);

    const approve = b.decision === 'approve';
    const amount = Number(b.deposit_amount_usd);
    if (approve && (!Number.isFinite(amount) || amount < 0)) {
      return reply.code(400).send({ error: 'bad_request', message: '请填写押金金额（USD）' });
    }

    const result = await tx(async (c) => {
      if (approve) {
        const { rows } = await c.query(
          `UPDATE loan_applications SET
             status='pending_legal', sales_reviewer_id=$2, sales_reviewed_at=now(),
             sales_comment=$3, deposit_amount_usd=$4
           WHERE id=$1 RETURNING *`,
          [a.id, user.id, b.comment || null, amount]
        );
        await app.logEvent({
          client: c, applicationId: a.id, eventType: 'sales_approved',
          fromStatus: 'pending_sales', toStatus: 'pending_legal', actor: user,
          detail: `销售审核通过，押金要求 USD ${amount}，转法务合规确认${b.comment ? '；备注：' + b.comment : ''}`,
        });
        return rows[0];
      } else {
        const { rows } = await c.query(
          `UPDATE loan_applications SET
             status='rejected', sales_reviewer_id=$2, sales_reviewed_at=now(), sales_comment=$3
           WHERE id=$1 RETURNING *`,
          [a.id, user.id, b.comment || null]
        );
        await app.logEvent({
          client: c, applicationId: a.id, eventType: 'sales_rejected',
          fromStatus: 'pending_sales', toStatus: 'rejected', actor: user,
          detail: `销售驳回：${b.comment || '未说明原因'}`,
        });
        return rows[0];
      }
    });
    return { application: result };
  });

  // ---------------- 法务合规审核（只涉及合同/合规） ----------------
  app.post('/applications/:id/legal-review', {
    preHandler: app.requireRole('legal'),
  }, async (req, reply) => {
    const user = req.user as AuthUser;
    const b = req.body as Record<string, any>;
    const a = await load((req.params as any).id);
    if (!a) return reply.code(404).send({ error: 'not_found', message: '申请单不存在' });
    expect(a.status, ['pending_legal']);

    const pass = b.decision === 'pass';
    const result = await tx(async (c) => {
      if (pass) {
        if (!b.contract_no || !b.export_classification) {
          const err = new Error('合规通过时必须填写合同编号与出口管制分类') as Error & { statusCode: number };
          err.statusCode = 400;
          throw err;
        }
        const { rows } = await c.query(
          `UPDATE loan_applications SET
             status='approved', legal_reviewer_id=$2, legal_reviewed_at=now(),
             compliance_passed=true, contract_no=$3, contract_terms=$4,
             export_classification=$5, compliance_notes=$6
           WHERE id=$1 RETURNING *`,
          [a.id, user.id, b.contract_no, b.contract_terms || null,
           b.export_classification, b.compliance_notes || null]
        );
        await app.logEvent({
          client: c, applicationId: a.id, eventType: 'compliance_passed',
          fromStatus: 'pending_legal', toStatus: 'approved', actor: user,
          detail: `法务合规通过；合同 ${b.contract_no}；管制分类 ${b.export_classification}`,
        });
        return rows[0];
      } else {
        const { rows } = await c.query(
          `UPDATE loan_applications SET
             status='compliance_blocked', legal_reviewer_id=$2, legal_reviewed_at=now(),
             compliance_passed=false, contract_no=$3, export_classification=$4,
             compliance_notes=$5
           WHERE id=$1 RETURNING *`,
          [a.id, user.id, b.contract_no || null,
           b.export_classification || null, b.compliance_notes || '出口/合规审查未通过']
        );
        await app.logEvent({
          client: c, applicationId: a.id, eventType: 'compliance_blocked',
          fromStatus: 'pending_legal', toStatus: 'compliance_blocked', actor: user,
          detail: `法务合规拦截：${b.compliance_notes || '不符合出口管制或合同要求'}`,
        });
        return rows[0];
      }
    });
    return { application: result };
  });

  // ---------------- 押金到账确认（销售登记） ----------------
  app.post('/applications/:id/deposit', {
    preHandler: app.requireRole('sales'),
  }, async (req, reply) => {
    const user = req.user as AuthUser;
    const a = await load((req.params as any).id);
    if (!a) return reply.code(404).send({ error: 'not_found', message: '申请单不存在' });
    expect(a.status, ['approved']);
    if (!a.deposit_amount_usd || Number(a.deposit_amount_usd) === 0) {
      return reply.code(409).send({ error: 'invalid', message: '该单未设置押金金额' });
    }
    const result = await tx(async (c) => {
      const { rows } = await c.query(
        `UPDATE loan_applications SET status='deposit_paid', deposit_status='paid', deposit_paid_at=now()
         WHERE id=$1 RETURNING *`, [a.id]
      );
      await app.logEvent({
        client: c, applicationId: a.id, eventType: 'deposit_paid',
        fromStatus: 'approved', toStatus: 'deposit_paid', actor: user,
        detail: `押金 USD ${a.deposit_amount_usd} 已到账，通知仓库可发货`,
      });
      return rows[0];
    });
    return { application: result };
  });

  // ---------------- 仓库发货 ----------------
  app.post('/applications/:id/ship', {
    preHandler: app.requireRole('warehouse'),
  }, async (req, reply) => {
    const user = req.user as AuthUser;
    const b = req.body as Record<string, any>;
    const a = await load((req.params as any).id);
    if (!a) return reply.code(404).send({ error: 'not_found', message: '申请单不存在' });
    expect(a.status, ['deposit_paid']); // 押金到账才放行
    if (!b.tracking_no || !b.carrier) {
      return reply.code(400).send({ error: 'bad_request', message: '请填写物流单号与承运商' });
    }

    const result = await tx(async (c) => {
      const { rows: stock } = await c.query(
        'SELECT stock_qty FROM products WHERE id=$1 FOR UPDATE', [a.product_id]
      );
      if (stock[0].stock_qty < a.quantity) {
        const err = new Error('库存不足，无法发货') as Error & { statusCode: number };
        err.statusCode = 409;
        throw err;
      }
      await c.query('UPDATE products SET stock_qty = stock_qty - $2 WHERE id=$1',
        [a.product_id, a.quantity]);
      const { rows } = await c.query(
        `UPDATE loan_applications
         SET status='shipped', outbound_tracking_no=$2, outbound_carrier=$3, shipped_at=now()
         WHERE id=$1 RETURNING *`,
        [a.id, b.tracking_no, b.carrier]
      );
      await app.logEvent({
        client: c, applicationId: a.id, eventType: 'shipped',
        fromStatus: 'deposit_paid', toStatus: 'shipped', actor: user,
        detail: `已通过 ${b.carrier} 发货，单号 ${b.tracking_no}，目的地 ${a.destination_country}`,
      });
      return rows[0];
    });
    return { application: result };
  });

  // ---------------- 仓库确认客户签收 ----------------
  app.post('/applications/:id/deliver', {
    preHandler: app.requireRole('warehouse'),
  }, async (req) => {
    const user = req.user as AuthUser;
    const a = await load((req.params as any).id);
    if (!a) throw Object.assign(new Error('申请单不存在'), { statusCode: 404 });
    expect(a.status, ['shipped']);
    const result = await tx(async (c) => {
      const { rows } = await c.query(
        `UPDATE loan_applications SET status='in_trial', delivered_at=now()
         WHERE id=$1 RETURNING *`, [a.id]
      );
      await app.logEvent({
        client: c, applicationId: a.id, eventType: 'delivered',
        fromStatus: 'shipped', toStatus: 'in_trial', actor: user,
        detail: '客户已签收，进入试用期',
      });
      return rows[0];
    });
    return { application: result };
  });

  // ---------------- 客户提交试用反馈 ----------------
  app.post('/applications/:id/feedback', {
    preHandler: app.requireRole('customer'),
  }, async (req, reply) => {
    const user = req.user as AuthUser;
    const b = req.body as Record<string, any>;
    const a = await load((req.params as any).id);
    if (!a) return reply.code(404).send({ error: 'not_found', message: '申请单不存在' });
    if (a.customer_id !== user.id) {
      return reply.code(403).send({ error: 'forbidden', message: '只能对自己的申请提交反馈' });
    }
    expect(a.status, ['in_trial', 'return_shipped', 'returned', 'completed']);
    const rating = Number(b.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !b.content) {
      return reply.code(400).send({ error: 'bad_request', message: '请给出 1-5 评分并填写反馈内容' });
    }
    const created = await tx(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO trial_feedbacks (application_id, rating, content)
         VALUES ($1,$2,$3) RETURNING *`,
        [a.id, rating, b.content]
      );
      await app.logEvent({
        client: c, applicationId: a.id, eventType: 'feedback',
        actor: user, detail: `客户试用反馈 ${rating} 星`,
      });
      return rows[0];
    });
    return reply.code(201).send({ feedback: created });
  });

  // ---------------- 客户登记寄回物流 ----------------
  app.post('/applications/:id/return-ship', {
    preHandler: app.requireRole('customer'),
  }, async (req, reply) => {
    const user = req.user as AuthUser;
    const b = req.body as Record<string, any>;
    const a = await load((req.params as any).id);
    if (!a) return reply.code(404).send({ error: 'not_found', message: '申请单不存在' });
    if (a.customer_id !== user.id) {
      return reply.code(403).send({ error: 'forbidden', message: '只能归还自己的样机' });
    }
    expect(a.status, ['in_trial', 'overdue']);
    if (!b.tracking_no || !b.carrier) {
      return reply.code(400).send({ error: 'bad_request', message: '请填写寄回物流单号与承运商' });
    }
    const result = await tx(async (c) => {
      const { rows } = await c.query(
        `UPDATE loan_applications
         SET status='return_shipped', inbound_tracking_no=$2, inbound_carrier=$3
         WHERE id=$1 RETURNING *`,
        [a.id, b.tracking_no, b.carrier]
      );
      await app.logEvent({
        client: c, applicationId: a.id, eventType: 'return_shipped',
        fromStatus: a.status, toStatus: 'return_shipped', actor: user,
        detail: `客户已通过 ${b.carrier} 寄回，单号 ${b.tracking_no}`,
      });
      return rows[0];
    });
    return { application: result };
  });

  // ---------------- 仓库签收回件 ----------------
  app.post('/applications/:id/receive', {
    preHandler: app.requireRole('warehouse'),
  }, async (req) => {
    const user = req.user as AuthUser;
    const a = await load((req.params as any).id);
    if (!a) throw Object.assign(new Error('申请单不存在'), { statusCode: 404 });
    expect(a.status, ['return_shipped']);
    const result = await tx(async (c) => {
      await c.query('UPDATE products SET stock_qty = stock_qty + $2 WHERE id=$1',
        [a.product_id, a.quantity]);
      const { rows } = await c.query(
        `UPDATE loan_applications SET status='returned', return_received_at=now()
         WHERE id=$1 RETURNING *`, [a.id]
      );
      await app.logEvent({
        client: c, applicationId: a.id, eventType: 'received',
        fromStatus: 'return_shipped', toStatus: 'returned', actor: user,
        detail: '仓库已签收归还包裹，待入库质检',
      });
      return rows[0];
    });
    return { application: result };
  });

  // ---------------- 仓库归还质检 + 押金结算 ----------------
  app.post('/applications/:id/inspect', {
    preHandler: app.requireRole('warehouse'),
  }, async (req) => {
    const user = req.user as AuthUser;
    const b = req.body as Record<string, any>;
    const a = await load((req.params as any).id);
    if (!a) throw Object.assign(new Error('申请单不存在'), { statusCode: 404 });
    expect(a.status, ['returned']);
    const resultInspection = b.result as 'good' | 'damaged' | 'lost';
    if (!['good', 'damaged', 'lost'].includes(resultInspection)) {
      throw Object.assign(new Error('质检结果必须是 good / damaged / lost'), { statusCode: 400 });
    }

    const deposit = Number(a.deposit_amount_usd || 0);
    let refund: number | null = null;
    let depositStatus: string;
    if (resultInspection === 'good') { refund = deposit; depositStatus = deposit > 0 ? 'refunded' : 'unpaid'; }
    else if (resultInspection === 'damaged') {
      refund = b.refund_amount_usd != null ? Number(b.refund_amount_usd) : Math.round(deposit * 0.5 * 100) / 100;
      if (refund > deposit) refund = deposit;
      depositStatus = refund === 0 ? 'forfeited' : 'partially_refunded';
    } else {
      // 样机丢失：恢复的库存再次扣减
      refund = 0; depositStatus = 'forfeited';
    }

    const result = await tx(async (c) => {
      if (resultInspection === 'lost') {
        await c.query('UPDATE products SET stock_qty = GREATEST(stock_qty - $2, 0) WHERE id=$1',
          [a.product_id, a.quantity]);
      }
      const { rows } = await c.query(
        `UPDATE loan_applications SET
           status='completed', inspection_result=$2, inspection_notes=$3,
           inspected_by=$4, inspected_at=now(),
           deposit_status=$5, deposit_refund_amount=$6, deposit_settled_at=now()
         WHERE id=$1 RETURNING *`,
        [a.id, resultInspection, b.notes || null, user.id, depositStatus, refund]
      );
      await app.logEvent({
        client: c, applicationId: a.id, eventType: 'inspected',
        fromStatus: 'returned', toStatus: 'completed', actor: user,
        detail:
          resultInspection === 'good' ? `质检合格，押金 USD ${refund} 全额退还，流程完成`
          : resultInspection === 'damaged'
            ? `质检发现损坏，押金退还 USD ${refund}（剩余作为维修/折旧），流程完成`
            : `样机丢失，押金 USD ${deposit} 不予退还，流程完成`,
      });
      return rows[0];
    });
    return { application: result };
  });
};

export default routes;
