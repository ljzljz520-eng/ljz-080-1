import type { FastifyPluginAsync } from 'fastify';
import { pool, tx } from '../db.js';
import type { AuthUser } from '../types.js';

const routes: FastifyPluginAsync = async (app) => {
  /**
   * 超期扫描：承诺寄回日期已过、仍处于 in_trial 的单子标记为 overdue。
   * 可由定时任务或人工触发；销售与仓库可执行。
   */
  app.post('/ops/sweep-overdue', {
    preHandler: app.requireRole('sales', 'warehouse'),
  }, async (req) => {
    const actor = req.user as AuthUser;
    const { rows } = await pool.query(
      `SELECT id, code FROM loan_applications
       WHERE status = 'in_trial' AND return_date < CURRENT_DATE`
    );
    for (const r of rows) {
      await tx(async (c) => {
        await c.query(`UPDATE loan_applications SET status='overdue' WHERE id=$1`, [r.id]);
        await app.logEvent({
          client: c,
          applicationId: r.id,
          eventType: 'overdue_marked',
          fromStatus: 'in_trial',
          toStatus: 'overdue',
          actor,
          detail: '系统超期扫描：已超过承诺寄回日期，标记为超期',
        });
      });
    }
    return { marked: rows.length, codes: rows.map((r) => r.code) };
  });
};

export default routes;
