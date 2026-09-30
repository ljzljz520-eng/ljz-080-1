# 🌍 跨境样品借测系统 (Cross-border Sample Loan & Evaluation)

客户申请借用样机 → 销售审核 → 法务合同/合规审查 → 押金到账 → 仓库发货 → 客户试用反馈 → 寄回 → 仓库签收质检 → 押金结算，全流程可追踪。

**技术栈**：Remix 2（Web，:3000）· Fastify 4（API，:4000）· PostgreSQL 15 · JWT 鉴权 · TypeScript 全栈

## 角色与权限隔离（核心）

| 角色 | 能做什么 | 数据可见性 |
|---|---|---|
| **客户 customer** | 申请样机、查看自己的单据、提交试用反馈、登记寄回物流 | 只能看自己的申请 |
| **销售 sales** | 审核通过/驳回、设定押金、确认押金到账、查看试用反馈 | 全部业务字段 |
| **法务 legal** | 只处理合同编号、合同条款、出口管制分类(ECCN)、合规结论 | **看不到押金金额、物流单号、质检备注、反馈内容** |
| **仓库 warehouse** | 押金到账后发货、签收客户件、入库质检、押金结算建议 | **看不到合同条款/合规备注/押金金额**，只看到「押金已到账」状态 |

此外列表与详情双层做了**阶段隔离**：法务/仓库即使拿到 URL，也无法查看尚未进入本环节的单据。

## 状态机

```
pending_sales ──销售通过──▶ pending_legal ──法务通过──▶ approved
      │                         │
      └──驳回──▶ rejected        └──拦截──▶ compliance_blocked

approved ──押金到账(sales)──▶ deposit_paid ──仓库发货(扣库存)──▶ shipped
  ──签收──▶ in_trial ──客户寄回──▶ return_shipped ──仓库签收(回补库存)──▶ returned
  ──质检+押金结算──▶ completed

in_trial 超过 return_date ──超期扫描──▶ overdue（仍可寄回）
```

关键门禁：**押金未到账仓库无法发货**；质检结果 good=全额退押金，damaged=部分退还，lost=没收押金并再次扣减库存。

## 数据模型

- `users`（4 种角色）、`products`（含库存）
- `loan_applications`：申请内容 + 销售/法务/押金/物流/质检全部字段，状态枚举约束
- `trial_feedbacks`：试用评分与反馈
- `application_events`：每次状态流转自动写入的审计事件 → 前端渲染为全流程时间线

## 目录

```
db/schema.sql              PostgreSQL 建表
scripts/init-db.ts         建表 + 种子用户/产品/演示单
packages/api/              Fastify API（JWT、角色守卫、工作流路由）
  src/routes/auth.ts         登录
  src/routes/products.ts     样机/库存
  src/routes/applications.ts 申请创建/列表/详情（按角色裁剪 SELECT 字段）
  src/routes/actions.ts      销售审核/法务/押金/发货/反馈/寄回/质检
  src/routes/ops.ts          超期扫描
  src/views.ts               各角色字段白名单
packages/web/              Remix（SSR loader 调 API，httpOnly cookie 存 JWT）
  app/routes/login.tsx       登录
  app/routes/_app.*.tsx      鉴权布局 + 各角色页面/操作面板
```

## 快速开始

```bash
# 1) 准备 PostgreSQL（本机已有实例则跳过，设置 DATABASE_URL 即可）
# 2) 安装依赖
npm install
# 3) 初始化数据库 + 种子数据
npm run db:init
# 4) 启动 API 与 Web（两个终端）
npm run dev:api   # http://localhost:4000
npm run dev:web   # http://localhost:3000
```

## 演示账号（密码均为 password123）

| 邮箱 | 角色 |
|---|---|
| customer@demo.com | 客户（深圳远航科技） |
| sales@demo.com | 销售 |
| legal@demo.com | 法务 |
| warehouse@demo.com | 仓库 |

建议体验路径：用客户账号申请一台样机 → 切销售审核并设定押金 → 切法务做合规通过 → 回销售确认押金到账 → 切仓库发货 → 客户签收后提交反馈并登记寄回 → 仓库签收回件、质检结算。每个账号在同一张单上看到的内容都不同。
