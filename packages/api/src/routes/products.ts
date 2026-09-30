import type { FastifyPluginAsync } from 'fastify';
import { pool } from '../db.js';

const routes: FastifyPluginAsync = async (app) => {
  // 库存对所有登录角色可见（客户下单需要、仓库需要）
  app.get('/products', { preHandler: app.requireRole() }, async () => {
    const { rows } = await pool.query(
      `SELECT id, model, name, description, unit_value_usd, stock_qty
       FROM products ORDER BY model`
    );
    return { products: rows };
  });
};

export default routes;
