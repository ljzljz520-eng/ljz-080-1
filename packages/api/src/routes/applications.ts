import type { FastifyPluginAsync } from 'fastify';
import { pool, tx } from '../db.js';
import { roleScope, canSeeFeedback } from '../views.js';
import type { AuthUser } from '../types.js';

const routes: FastifyPluginAsync = async (app) => {
  // ---------- 客户提交申请 ----------
  app.post('/applications', { preHandler: app.requireRole('customer') }, async (req, reply) => {
    const b = req.body as Record<string, any>;
    const user = req.user as AuthUser;

    for (const k of ['product_id', 'destination_country', 'test_purpose', 'return_date']) {
      if (!b[k]) return reply.code(400).send({ error: 'bad_request', message: `缺少字段: ${k}` });
    }
    const returnDate = new Date(b.return_date);
    if (isNaN(returnDate.getTime())) {
      return reply.code(400).send({ error: 'bad_request', message: '寄回日期格式无效' });
    }
    if (returnDate < new Date(new Date().toDateString())) {
      return reply.code(400).send({ error: 'bad_request', message: '寄回日期不能早于今天' });
    }

    const { rows: p } = await pool.query('SELECT stock_qty FROM products WHERE id = $1', [b.product_id]);
    if (!p[0]) return reply.code(404).send({ error: 'not_found', message: '样机不存在' });
    const qty = Number(b.quantity) || 1;
    if (p[0].stock_qty < qty) {
      return reply.code(409).send({ error: 'out_of_stock', message: '库存不足' });
    }

    const { rows: seq } = await pool.query(
      `SELECT to_char(now(),'YYYYMMDD') AS d, COUNT(*)::int AS n
       FROM loan_applications WHERE code LIKE to_char(now(),'LN-YYYYMMDD') || '-%'`
    );
    const code = `LN-${seq[0].d}-${String(seq[0].n + 1).padStart(4, '0')}`;

    const created = await tx(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO loan_applications
           (code, customer_id, product_id, quantity, destination_country,
            test_purpose, return_date, remark, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending_sales')
         RETURNING *`,
        [code, user.id, b.product_id, qty, b.destination_country.trim(),
         b.test_purpose.trim(), returnDate, b.remark?.trim() || null]
      );
      await app.logEvent({
        client: c,
        applicationId: rows[0].id,
        eventType: 'submitted',
        toStatus: 'pending_sales',
        actor: user,
        detail: `申请借往 ${b.destination_country}，承诺 ${b.return_date} 寄回`,
      });
      return rows[0];
    });

    return reply.code(201).send({ application: created });
  });

  // ---------- 列表（按角色过滤可见范围） ----------
  app.get('/applications', { preHandler: app.requireRole() }, async (req) => {
    const user = req.user as AuthUser;
    const q = req.query as Record<string, string>;
    const where: string[] = [];
    const params: any[] = [];

    if (user.role === 'customer') {
      params.push(user.id);
      where.push(`a.customer_id = $${params.length}`);
    } else if (user.role === 'sales') {
      // 销售看到自己负责审核的（演示中全部销售单）
      if (q.mine === '1') where.push(`a.sales_reviewer_id = '${user.id}'`);
    } else if (user.role === 'legal') {
      where.push(`a.status IN ('pending_legal','approved','deposit_paid','shipped','in_trial',
                               'return_shipped','returned','completed','compliance_blocked')`);
    } else if (user.role === 'warehouse') {
      where.push(`a.status IN ('deposit_paid','shipped','in_trial','return_shipped','returned','completed')`);
    }
    if (q.status) {
      params.push(q.status);
      where.push(`a.status = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT ${roleScope(user.role)} ,
              u.name AS customer_name, u.company AS customer_company,
              p.model AS product_model, p.name AS product_name
       FROM loan_applications a
       JOIN users u ON u.id = a.customer_id
       JOIN products p ON p.id = a.product_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY a.created_at DESC
       LIMIT 200`,
      params
    );
    return { applications: rows };
  });

  // ---------- 详情（含时间线/反馈，按角色裁剪） ----------
  app.get('/applications/:id', { preHandler: app.requireRole() }, async (req, reply) => {
    const user = req.user as AuthUser;
    const { rows } = await pool.query(
      `SELECT ${roleScope(user.role)},
              u.name AS customer_name, u.email AS customer_email, u.company AS customer_company,
              p.model AS product_model, p.name AS product_name, p.unit_value_usd AS product_unit_value
       FROM loan_applications a
       JOIN users u ON u.id = a.customer_id
       JOIN products p ON p.id = a.product_id
       WHERE a.id = $1`,
      [(req.params as any).id]
    );
    const appRow = rows[0];
    if (!appRow) return reply.code(404).send({ error: 'not_found', message: '申请单不存在' });

    if (user.role === 'customer' && appRow.customer_id !== user.id) {
      return reply.code(403).send({ error: 'forbidden', message: '无权查看他人申请' });
    }
    // 阶段隔离：法务/仓库即使直接访问 URL，也只能看到与自己环节相关的单据
    if (user.role === 'legal' &&
      ['draft', 'pending_sales', 'rejected'].includes(appRow.status)) {
      return reply.code(403).send({ error: 'forbidden', message: '该单尚未进入法务环节' });
    }
    if (user.role === 'warehouse' &&
      ['draft', 'pending_sales', 'pending_legal', 'approved', 'rejected', 'compliance_blocked'].includes(appRow.status)) {
      return reply.code(403).send({ error: 'forbidden', message: '该单尚未进入仓库环节' });
    }

    const { rows: events } = await pool.query(
      `SELECT e.event_type, e.from_status, e.to_status, e.detail, e.created_at,
              e.actor_role, u.name AS actor_name
       FROM application_events e
       LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.application_id = $1
       ORDER BY e.created_at ASC`,
      [appRow.id]
    );

    let feedbacks: any[] = [];
    if (canSeeFeedback(user.role)) {
      const r = await pool.query(
        `SELECT id, rating, content, created_at FROM trial_feedbacks
         WHERE application_id = $1 ORDER BY created_at DESC`,
        [appRow.id]
      );
      feedbacks = r.rows;
    }

    return { application: appRow, events, feedbacks };
  });
};

export default routes;
