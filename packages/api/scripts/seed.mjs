// 演示数据：5 个角色账号、3 个产品、样机库存，以及覆盖全流程各状态的借用单
import pg from 'pg';
import crypto from 'node:crypto';
import { pgConfig } from '../src/pg-config.mjs';

function hash(pw, salt) {
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
const pool = new pg.Pool(pgConfig());
const q = (t, p = []) => pool.query(t, p);

const PW = 'demo1234';
const salt = '0123456789abcdef';
const ph = hash(PW, salt);

await q(`TRUNCATE return_inspections, trial_feedbacks, shipments, contracts,
        deposits, status_events, loan_applications, sample_units, products, users
        RESTART IDENTITY CASCADE`);
await q(`ALTER SEQUENCE loan_code_seq RESTART WITH 1`);

// ---------- 用户 ----------
const users = [
  ['liwei@demo.com',  '李伟',  '远景智能科技', 'customer'],
  ['zhangna@demo.com','张娜',  '本公司',       'sales'],
  ['wangfang@demo.com','王芳', '本公司',       'warehouse'],
  ['chenmo@demo.com', '陈默',  '本公司法务部', 'legal'],
  ['admin@demo.com',  '系统管理员', '本公司',   'admin'],
];
const uid = {};
for (const [email, name, company, role] of users) {
  const r = await q(
    `INSERT INTO users (email, password_hash, name, company, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [email, ph, name, company, role],
  );
  uid[role] = r.rows[0].id;
}

// ---------- 产品与样机 ----------
const products = [
  ['X1-Edge',  'X1 边缘计算网关', '工业网关', 3000, '适用于工业现场协议采集与边缘分析', 3],
  ['R500-Cam', 'R500 AI 视觉相机', '机器视觉', 8000, '产线缺陷检测，支持本地推理', 2],
  ['S9-Sensor','S9 多合一环境传感器', '传感器', 800, '温湿度/光照/振动多参数采集', 4],
];
const pid = {};
let unitSeq = 1000;
for (const [model, name, cat, deposit, desc, n] of products) {
  const r = await q(
    `INSERT INTO products (model,name,category,deposit_amount,description)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [model, name, cat, deposit, desc],
  );
  pid[model] = r.rows[0].id;
  for (let i = 0; i < n; i++) {
    unitSeq += 1;
    await q(`INSERT INTO sample_units (product_id, serial_no) VALUES ($1,$2)`,
      [r.rows[0].id, `SN-${model}-${unitSeq}`]);
  }
}

// ---------- 借用单构造工具 ----------
let codeSeq = 0;
async function makeLoan({
  customer = uid.customer, product, country, purpose, detail, retDate,
  status, sales = uid.sales, note = null, unitAssign = false,
  eventsExtra = [],
}) {
  codeSeq += 1;
  const code = `LA-20260930-${String(codeSeq).padStart(4, '0')}`;
  const r = await q(
    `INSERT INTO loan_applications
       (code,customer_id,product_id,destination_country,test_purpose,test_purpose_detail,
        expected_return_date,status,sales_id,reviewed_at,review_note,compliance_flag)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::loan_status,$9::bigint,
       CASE WHEN $8::loan_status = 'submitted' THEN NULL ELSE now() END, $10,
       CASE WHEN $8::loan_status='submitted' THEN 'required' ELSE 'cleared' END)
     RETURNING id`,
    [code, customer, product, country, purpose, detail, retDate, status, sales, note],
  );
  const id = r.rows[0].id;
  await q(`INSERT INTO deposits (loan_id, amount) SELECT $1, deposit_amount FROM products WHERE id=$2`, [id, product]);
  await q(`INSERT INTO contracts (loan_id, status) VALUES ($1,'pending_legal')`, [id]);
  let unitId = null;
  if (unitAssign) {
    const u = await q(`SELECT id FROM sample_units WHERE product_id=$1 ORDER BY id LIMIT 1`, [product]);
    unitId = u.rows[0].id;
    await q(`UPDATE loan_applications SET unit_id=$1 WHERE id=$2`, [unitId, product === product ? id : id]);
  }
  await q(`INSERT INTO status_events (loan_id, from_status, to_status, actor_id, note)
           VALUES ($1,NULL,'submitted',$2,'客户提交借用申请')`, [id, customer]);
  for (const ev of eventsExtra) await q(
    `INSERT INTO status_events (loan_id, from_status, to_status, actor_id, note) VALUES ($1,$2,$3,$4,$5)`,
    [id, ev[0], ev[1], ev[2], ev[3]]);
  return { id, unitId };
}

const future = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

// 1) 待销售审核（新申请）
await makeLoan({
  product: pid['R500-Cam'], country: '德国',
  purpose: '汽车零部件产线缺陷检测 POC',
  detail: '在斯图加特工厂产线连续运行 2 周，验证检测精度与节拍。',
  retDate: future(30), status: 'submitted',
});

// 2) 审核通过·准备中（押金未付、合同未签）
await makeLoan({
  product: pid['X1-Edge'], country: '越南',
  purpose: '工厂能耗采集协议适配验证',
  detail: '测试 Modbus / OPC UA 接入与断网缓存。',
  retDate: future(21), status: 'approved', note: '同意，注意出口合规文件',
  eventsExtra: [['submitted', 'approved', uid.sales, '销售审核通过']],
});

// 3) 待仓库发货（门禁全部满足）
{
  const l = await makeLoan({
    product: pid['S9-Sensor'], country: '泰国',
    purpose: '冷链仓温湿度监测试点',
    detail: '验证低功耗与 4G 上报稳定性。',
    retDate: future(25), status: 'ready', unitAssign: true, note: '同意',
    eventsExtra: [
      ['submitted', 'approved', uid.sales, '销售审核通过'],
      ['approved', 'ready', null, '合同/押金/样机就绪，自动进入待发货'],
    ],
  });
  await q(`UPDATE deposits SET status='paid', paid_at=now(), paid_method='银行转账', recorded_by=$2 WHERE loan_id=$1`, [l.id, uid.sales]);
  await q(`UPDATE contracts SET status='signed', title='样机借用协议(跨境)', drafted_by=$2, drafted_at=now(), signed_by=$3, signed_at=now() WHERE loan_id=$1`,
    [l.id, uid.legal, uid.customer]);
}

// 4) 已发货（运输中）
{
  const l = await makeLoan({
    product: pid['R500-Cam'], country: '日本',
    purpose: '半导体外观检测方案验证',
    retDate: future(18), status: 'shipped', unitAssign: true, note: '同意',
    eventsExtra: [
      ['submitted', 'approved', uid.sales, '销售审核通过'],
      ['approved', 'ready', null, '就绪'],
      ['ready', 'shipped', uid.warehouse, '仓库发货：DHL JD012345678JP'],
    ],
  });
  await q(`UPDATE deposits SET status='paid', paid_at=now(), recorded_by=$2 WHERE loan_id=$1`, [l.id, uid.sales]);
  await q(`UPDATE contracts SET status='signed', title='样机借用协议(跨境)', drafted_by=$2, drafted_at=now(), signed_by=$3, signed_at=now() WHERE loan_id=$1`,
    [l.id, uid.legal, uid.customer]);
  await q(`INSERT INTO shipments (loan_id,direction,carrier,tracking_no,created_by) VALUES ($1,'outbound','DHL','JD012345678JP',$2)`,
    [l.id, uid.warehouse]);
  await q(`UPDATE sample_units SET status='on_loan' WHERE id=$1`, [l.unitId]);
}

// 5) 试用中 + 反馈
{
  const l = await makeLoan({
    product: pid['X1-Edge'], country: '马来西亚',
    purpose: '光伏电站数据采集联调',
    retDate: future(10), status: 'in_trial', unitAssign: true, note: '同意',
    eventsExtra: [
      ['submitted', 'approved', uid.sales, '销售审核通过'],
      ['approved', 'ready', null, '就绪'],
      ['ready', 'shipped', uid.warehouse, '仓库发货：FedEx FX778899SG'],
      ['shipped', 'delivered', uid.warehouse, '客户签收'],
      ['delivered', 'in_trial', uid.customer, '开始试用测试'],
    ],
  });
  await q(`UPDATE deposits SET status='paid', paid_at=now(), recorded_by=$2 WHERE loan_id=$1`, [l.id, uid.sales]);
  await q(`UPDATE contracts SET status='signed', title='样机借用协议(跨境)', drafted_by=$2, drafted_at=now(), signed_by=$3, signed_at=now() WHERE loan_id=$1`,
    [l.id, uid.legal, uid.customer]);
  await q(`INSERT INTO shipments (loan_id,direction,carrier,tracking_no,status,created_by,delivered_at)
           VALUES ($1,'outbound','FedEx','FX778899SG','delivered',$2, now() - interval '6 day')`, [l.id, uid.warehouse]);
  await q(`INSERT INTO trial_feedbacks (loan_id,rating,usage_summary,issues,result,submitted_at)
           VALUES ($1,4,'设备接入 12 台逆变器稳定，边缘告警延迟<3s。','高温环境外壳偏烫，建议改进散热。','POC 达到预期，客户有意采购 20 台。', now() - interval '1 day')`, [l.id]);
  await q(`UPDATE sample_units SET status='on_loan' WHERE id=$1`, [l.unitId]);
}

// 6) 仓库已收货，待检验
{
  const l = await makeLoan({
    product: pid['S9-Sensor'], country: '新加坡',
    purpose: '智慧楼宇环境监测试点',
    retDate: future(-2), status: 'returned', unitAssign: true, note: '同意',
    eventsExtra: [
      ['submitted', 'approved', uid.sales, '销售审核通过'],
      ['approved', 'ready', null, '就绪'],
      ['ready', 'shipped', uid.warehouse, '仓库发货'],
      ['shipped', 'delivered', uid.warehouse, '客户签收'],
      ['delivered', 'in_trial', uid.customer, '开始试用'],
      ['in_trial', 'return_shipped', uid.customer, '客户寄回：UPS 1Z999AA'],
      ['return_shipped', 'returned', uid.warehouse, '仓库签收获归还'],
    ],
  });
  await q(`UPDATE deposits SET status='paid', paid_at=now(), recorded_by=$2 WHERE loan_id=$1`, [l.id, uid.sales]);
  await q(`UPDATE contracts SET status='signed', title='样机借用协议(跨境)', drafted_by=$2, drafted_at=now(), signed_by=$3, signed_at=now() WHERE loan_id=$1`,
    [l.id, uid.legal, uid.customer]);
  await q(`INSERT INTO shipments (loan_id,direction,carrier,tracking_no,status,created_by) VALUES ($1,'outbound','UPS','OUT-8801','delivered',$2)`, [l.id, uid.warehouse]);
  await q(`INSERT INTO shipments (loan_id,direction,carrier,tracking_no,status,created_by) VALUES ($1,'return','UPS','1Z999AA','delivered',$2)`, [l.id, uid.customer]);
  await q(`UPDATE sample_units SET status='on_loan' WHERE id=$1`, [l.unitId]);
}

// 7) 已完结
{
  const l = await makeLoan({
    product: pid['X1-Edge'], country: '韩国',
    purpose: '仓储 AGV 调度网关兼容性测试',
    retDate: future(-15), status: 'completed', unitAssign: true, note: '同意',
    eventsExtra: [
      ['submitted', 'approved', uid.sales, '销售审核通过'],
      ['approved', 'ready', null, '就绪'],
      ['ready', 'shipped', uid.warehouse, '仓库发货'],
      ['shipped', 'delivered', uid.warehouse, '客户签收'],
      ['delivered', 'in_trial', uid.customer, '开始试用'],
      ['in_trial', 'return_shipped', uid.customer, '客户寄回'],
      ['return_shipped', 'returned', uid.warehouse, '仓库收货'],
      ['returned', 'inspected', uid.warehouse, '检验完好，可入库'],
      ['inspected', 'completed', uid.sales, '押金处理完毕，流程完结'],
    ],
  });
  await q(`UPDATE deposits SET status='paid', paid_at=now(), recorded_by=$2,
           refunded_at=now(), refund_note='完好归还，全额退还' WHERE loan_id=$1`, [l.id, uid.sales]);
  // 押金最终态置 refunded
  await q(`UPDATE deposits SET status='refunded' WHERE loan_id=$1`, [l.id]);
  await q(`UPDATE contracts SET status='signed', title='样机借用协议(跨境)', drafted_by=$2, drafted_at=now(), signed_by=$3, signed_at=now() WHERE loan_id=$1`,
    [l.id, uid.legal, uid.customer]);
  await q(`INSERT INTO shipments (loan_id,direction,carrier,tracking_no,status,created_by) VALUES ($1,'outbound','DHL','OUT-FIN1','delivered',$2)`, [l.id, uid.warehouse]);
  await q(`INSERT INTO shipments (loan_id,direction,carrier,tracking_no,status,created_by) VALUES ($1,'return','DHL','RET-FIN1','delivered',$2)`, [l.id, uid.customer]);
  await q(`INSERT INTO trial_feedbacks (loan_id,rating,usage_summary,issues,result) VALUES ($1,5,'兼容性测试全部通过。',NULL,'客户已下单 50 台。')`, [l.id]);
  await q(`INSERT INTO return_inspections (loan_id,result,condition_note,checked_by,checked_at,deduction)
           VALUES ($1,'pass','外观完好、功能正常',$2,now(),0)`, [l.id, uid.warehouse]);
  await q(`UPDATE sample_units SET status='available' WHERE id=$1`, [l.unitId]);
}

// 手工编号占用了 1..N，把序列推到 1000 避免冲突
await q(`SELECT setval('loan_code_seq', 1000, false)`);

await pool.end();
console.log('seed 完成：');
console.table(users.map(([email, name, , role]) => ({ 角色: role, 姓名: name, 邮箱: email, 密码: PW })));
