import type { FastifyInstance } from 'fastify';
import { query } from './db.js';

export async function productRoutes(app: FastifyInstance) {
  // 产品目录（任何登录用户，客户申请时选样机）
  app.get('/api/products', { preHandler: [app.authenticate] }, async () => {
    const { rows } = await query(
      `SELECT p.id, p.model, p.name, p.category, p.deposit_amount, p.description,
              (SELECT count(*) FROM sample_units su
                WHERE su.product_id = p.id AND su.status = 'available') AS available_count
         FROM products p ORDER BY p.model`,
    );
    return {
      products: rows.map((r) => ({
        id: r.id, model: r.model, name: r.name, category: r.category,
        depositAmount: Number(r.deposit_amount), description: r.description,
        availableCount: Number(r.available_count),
      })),
    };
  });
}
