import type { FastifyInstance } from 'fastify';
import { query, withTx } from './db.js';
import { allowRoles, type JwtUser } from './auth.js';
import {
  changeStatus, getFullLoan, httpError, listLoans, projectByRole, syncReadyGate,
} from './loan-service.js';

export async function loanRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  // 列表（按角色过滤 + 字段裁剪）
  app.get('/api/loans', {
    preHandler: [auth],
  }, async (req) => {
    const q = req.query as { status?: string; q?: string };
    const loans = await listLoans({ user: req.user, status: q.status, q: q.q });
    return { loans };
  });

  // 详情（按角色字段裁剪）
  app.get('/api/loans/:id', {
    preHandler: [auth],
  }, async (req) => {
    const id = Number((req.params as any).id);
    const full = await getFullLoan(id);
    return { loan: projectByRole(full, req.user) };
  });

  // 客户提交借用申请：国家、测试用途、预计寄回时间
  app.post('/api/loans', {
    preHandler: [auth, allowRoles('customer')],
  }, async (req, reply) => {
    const user = req.user as JwtUser;
    const body = req.body as {
      productId?: number; destinationCountry?: string;
      testPurpose?: string; testPurposeDetail?: string;
      expectedReturnDate?: string;
    };
    if (!body.productId || !body.destinationCountry || !body.testPurpose || !body.expectedReturnDate) {
      throw httpError(400, '请填写样机、目的国家、测试用途和预计寄回日期');
    }
    const country: string = body.destinationCountry;
    const purpose: string = body.testPurpose;
    const ret = new Date(body.expectedReturnDate);
    if (isNaN(ret.getTime()) || ret <= new Date()) {
      throw httpError(400, '预计寄回日期必须是未来日期');
    }
    const product = await query('SELECT id FROM products WHERE id = $1', [body.productId]);
    if (!product.rowCount) throw httpError(404, '产品不存在');

    const loanId = await withTx(async (c) => {
      const seq = await c.query("SELECT nextval('loan_code_seq') AS n");
      const code = `LA-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Number(seq.rows[0].n)).padStart(4, '0')}`;
      const la = await c.query(
        `INSERT INTO loan_applications
           (code, customer_id, product_id, destination_country, test_purpose,
            test_purpose_detail, expected_return_date, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'submitted')
         RETURNING id`,
        [code, user.id, body.productId, country.trim(),
         purpose.trim(), body.testPurposeDetail?.trim() ?? null, body.expectedReturnDate],
      );
      const id = la.rows[0].id as number;
      // 跨境默认需合同与押金
      await c.query(
        `INSERT INTO deposits (loan_id, amount)
         SELECT $1, deposit_amount FROM products WHERE id = $2`,
        [id, body.productId],
      );
      await c.query(
        `INSERT INTO contracts (loan_id, status) VALUES ($1, 'pending_legal')`,
        [id],
      );
      await c.query(
        `INSERT INTO status_events (loan_id, from_status, to_status, actor_id, note)
         VALUES ($1, NULL, 'submitted', $2, '客户提交借用申请')`,
        [id, user.id],
      );
      return id;
    });
    const full = await getFullLoan(loanId);
    return reply.code(201).send({ loan: projectByRole(full, user) });
  });

  // 客户取消（发货前）
  app.post('/api/loans/:id/cancel', {
    preHandler: [auth, allowRoles('customer', 'sales', 'admin')],
  }, async (req) => {
    const id = Number((req.params as any).id);
    const full = await getFullLoan(id);
    if (req.user.role === 'customer' && full.customer.id !== req.user.id) throw httpError(403, '无权操作');
    if (!['submitted', 'approved', 'ready'].includes(full.status)) {
      throw httpError(409, '当前状态不可取消');
    }
    await changeStatus(id, 'cancelled', req.user.id, '申请取消');
    return { loan: projectByRole(await getFullLoan(id), req.user) };
  });

  // 销售审核通过 / 驳回
  app.post('/api/loans/:id/review', {
    preHandler: [auth, allowRoles('sales', 'admin')],
  }, async (req) => {
    const id = Number((req.params as any).id);
    const { approve, note } = req.body as { approve?: boolean; note?: string };
    const full = await getFullLoan(id);
    if (full.status !== 'submitted') throw httpError(409, '仅待审核的申请可以审核');
    await query('UPDATE loan_applications SET sales_id = $1, reviewed_at = now(), review_note = $2 WHERE id = $3',
      [req.user.id, note?.trim() ?? null, id]);
    const to = approve ? 'approved' : 'rejected';
    await changeStatus(id, to, req.user.id, note);
    return { loan: projectByRole(await getFullLoan(id), req.user) };
  });

  // 销售分配样机（从可用库存挑一台）
  app.post('/api/loans/:id/assign-unit', {
    preHandler: [auth, allowRoles('sales', 'admin')],
  }, async (req) => {
    const id = Number((req.params as any).id);
    const { unitId } = req.body as { unitId?: number };
    const full = await getFullLoan(id);
    if (!['approved', 'ready'].includes(full.status)) throw httpError(409, '审核通过后才能分配样机');
    const unit = await query(
      `SELECT su.id, su.status FROM sample_units su
        WHERE su.id = $1 AND su.product_id = $2 FOR UPDATE`,
      [unitId, full.product.id],
    );
    if (!unit.rowCount) throw httpError(404, '样机不存在或型号不匹配');
    if (unit.rows[0].status !== 'available' && unit.rows[0].id !== full.unit?.id) {
      throw httpError(409, '该样机当前不可用');
    }
    await withTx(async (c) => {
      // 释放旧样机
      if (full.unit) await c.query(`UPDATE sample_units SET status = 'available' WHERE id = $1`, [full.unit.id]);
      await c.query('UPDATE loan_applications SET unit_id = $1, updated_at = now() WHERE id = $2', [unitId, id]);
      await c.query(
        `INSERT INTO status_events (loan_id, from_status, to_status, actor_id, note)
         VALUES ($1, NULL, (SELECT status FROM loan_applications WHERE id = $1), $2, $3)`,
        [id, req.user.id, `分配样机 ${unitId}`],
      );
    });
    await syncReadyGate(id);
    return { loan: projectByRole(await getFullLoan(id), req.user) };
  });

  // 可用样机列表（销售分配时选择）
  app.get('/api/loans/:id/available-units', {
    preHandler: [auth, allowRoles('sales', 'admin')],
  }, async (req) => {
    const id = Number((req.params as any).id);
    const full = await getFullLoan(id);
    const { rows } = await query(
      `SELECT id, serial_no, status FROM sample_units
        WHERE product_id = $1 ORDER BY serial_no`,
      [full.product.id],
    );
    return { units: rows.map((r) => ({ id: r.id, serialNo: r.serial_no, status: r.status })), currentUnitId: full.unit?.id ?? null };
  });
}
