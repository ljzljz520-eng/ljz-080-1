import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcryptjs';

const PG_CONNECTION =
  process.env.DATABASE_URL ||
  'postgresql://postgres@%2Ftmp/sample_loan';

async function main() {
  const root = new Client({ connectionString: PG_CONNECTION });
  await root.connect();
  const sql = fs.readFileSync(path.join(process.cwd(), 'db/schema.sql'), 'utf8');
  await root.query(sql);
  console.log('✓ schema applied');

  await root.query('TRUNCATE application_events, trial_feedbacks, loan_applications, products, users RESTART IDENTITY CASCADE');

  const hash = (p: string) => bcrypt.hash(p, 10);
  const users = [
    ['customer@demo.com', '客户·李工', 'customer', '深圳远航科技有限公司'],
    ['sales@demo.com', '销售·王经理', 'sales', null],
    ['legal@demo.com', '法务·陈合规', 'legal', null],
    ['warehouse@demo.com', '仓库·赵主管', 'warehouse', null],
  ];
  const userIds: Record<string, string> = {};
  for (const [email, name, role, company] of users) {
    const { rows } = await root.query(
      `INSERT INTO users (email, password_hash, name, role, company)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [email, await hash('password123'), name, role, company]
    );
    userIds[role] = rows[0].id;
  }
  console.log('✓ users seeded (password: password123)');

  const products = [
    ['X-Radar-Pro', 'X波段毫米波雷达样机', '交通/工业测速测距，含开发套件', 4800, 5],
    ['EdgeBox-A200', '边缘计算网关 A200', 'ARM A76 双核，支持 4G/5G 模组', 1250, 10],
    ['VisionCam-8K', '8K 工业视觉相机', 'GigE Vision，含 SDK 与镜头', 3600, 3],
    ['SensorTag-M1', '多合一环境传感标签', '温湿度/气压/IMU，电池供电', 380, 20],
  ];
  const productIds: Record<string, string> = {};
  for (const [model, name, description, price, qty] of products) {
    const { rows } = await root.query(
      `INSERT INTO products (model, name, description, unit_value_usd, stock_qty)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [model, name, description, price, qty]
    );
    productIds[model] = rows[0].id;
  }
  console.log('✓ products seeded');

  // 一条演示单（客户刚提交）
  const code = 'LN-20260930-0001';
  const { rows: appRows } = await root.query(
    `INSERT INTO loan_applications
       (code, customer_id, product_id, quantity, destination_country, test_purpose, return_date, remark, status)
     VALUES ($1,$2,$3,1,$4,$5,$6,$7,'pending_sales') RETURNING id`,
    [
      code,
      userIds.customer,
      productIds['X-Radar-Pro'],
      'Germany',
      '在德国慕尼黑车厂进行 ADAS 场景的雷达探测距离与抗干扰联合验证',
      '2026-11-15',
      '客户需含校准证书一套',
    ]
  );
  await root.query(
    `INSERT INTO application_events (application_id, event_type, to_status, actor_id, actor_role, detail)
     VALUES ($1,'submitted','pending_sales',$2,'customer',$3)`,
    [appRows[0].id, userIds.customer, '客户提交借测申请']
  );
  console.log('✓ demo application seeded:', code);

  await root.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
