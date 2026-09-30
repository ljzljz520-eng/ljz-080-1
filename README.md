# 🌐 跨境样品借测系统（Cross-Border Sample Loan）

客户在线申请借用样机 → 销售审核 → 法务合同/合规 → 押金 → 仓库发货 →
跨境物流追踪 → 客户试用反馈 → 寄回 → 仓库检验 → 押金退还结单，**全流程状态与时间线一路可见**。

技术栈：**Remix 2 + Fastify 5 + PostgreSQL 18**（TypeScript 全栈、npm workspaces 单体仓库）。

---

## 角色与最小权限

系统通过 **JWT + RBAC + 字段级投影** 实现“只看该看的”：后端按角色裁剪 JSON 字段，前端只渲染下发的分区。

| 能力 | 客户 customer | 销售 sales | 仓库 warehouse | 法务 legal | 管理员 admin |
|---|:-:|:-:|:-:|:-:|:-:|
| 提交借用申请（国家/测试用途/寄回日期） | ✅ | | | | |
| 审核通过 / 驳回 | | ✅ | | | ✅ |
| 分配样机序列号 | | ✅ | | | ✅ |
| 合同起草、出口合规审查/暂扣 | | | | ✅（仅法务） | |
| 在线签署合同 | ✅（本人单） | | | | |
| 押金登记 / 退款 / 结单 | | ✅ | | | ✅ |
| 出库发货、签收登记 | | | ✅（仅仓库） | | |
| 确认收货、归还检验 | | | ✅（仅仓库） | | |
| 试用反馈、登记寄回 | ✅（本人单） | | | | |
| 可见字段 | 本单全部 | 全部 | 仅收发所需¹ | 仅合同合规² | 全部 |

- ¹ 仓库**看不到**押金金额、合同正文、试用反馈、测试详情、商务备注。
- ² 法务**看不到**押金、物流单号、归还检验、样机分配等；只看合同、合规意见、目的国与测试用途。
- 跨角色调用接口返回 `403`；即使直连 API 拿到详情，无权字段也不会出现在响应中。

## 状态机

```
submitted 待审核 ─approve→ approved 准备中 ─门禁满足→ ready 待发货
      │                        ▲  │                     │ ship(仓库)
      └reject→ rejected        │  └─门禁失效自动退回      ▼
                              │                    shipped 已发货
                         (合同/押金/样机/合规)          │ 签收
                                                      ▼
 delivered 已签收 → in_trial 试用中 → return_shipped 已寄回
      → returned 仓库已收货 → inspected 检验完成 → completed 已完结
异常分支：rejected 驳回 / overdue 逾期 / cancelled 取消（发货前）
```

**发货门禁（系统自动判定，无需人工改状态）**：样机已分配 + 押金到账 + 合同已签署 + 法务合规通过，
四项全满足才自动进入 `ready`；任一条件被撤回（如法务合规暂扣）自动退回 `approved`。

## 页面（按角色出现不同菜单）

- `/login`、`/register` 登录 / 客户自助注册
- `/` 概览工作台（各角色看到自己的待办队列与统计）
- `/loans/new` 客户申请表（目的国、测试用途、预计寄回日期）
- `/loans` 借用单列表（状态筛选，字段按角色呈现）
- `/loans/:id` **单一事实页**：进度条、申请信息、发货门禁、押金、合同合规、物流（出库/寄回）、试用反馈、归还检验、操作面板、完整时间线
- `/sales/review` 销售待审队列
- `/warehouse` 仓库三段队列：待发货 / 待签收 / 待收货检验
- `/legal` 法务工作台：待起草合同、待签署、合规暂扣、已签署留档

## 架构

```
packages/
├── api/                 Fastify（REST + JWT，端口 4000）
│   ├── src/domain.ts        状态机 + 角色字段可见性矩阵
│   ├── src/auth.ts          scrypt 密码哈希、JWT、角色守卫
│   ├── src/loan-service.ts  状态流转、发货门禁、视图组装、字段投影
│   └── src/routes-*.ts      auth/products/loans/ops(押金·合同·物流·反馈·检验)
└── web/                 Remix（Vite，端口 3000，SSR + 渐进增强）
    └── app/
        ├── session.ts       httpOnly cookie 会话（存 JWT）
        ├── api.ts           服务端 Fetch 封装（自动带 token）
        └── routes/          文件路由 + 角色化操作面板
PostgreSQL：表 users/products/sample_units/loan_applications/status_events/
            deposits/contracts/shipments/trial_feedbacks/return_inspections
```

## 快速开始

```bash
npm install            # 安装依赖（workspaces）
npm run db:start       # 启动内置 PostgreSQL（首次会自动 initdb）
npm run migrate        # 建表
npm run seed           # 写入演示数据
npm run dev            # 同时启动 API(4000) 与 Web(3000)
# 打开 http://127.0.0.1:3000
```

生产构建：`npm run build`，然后分别 `npm --workspace packages/api start` 与
`npm --workspace packages/web start`。

### 演示账号（密码均为 `demo1234`）

| 角色 | 邮箱 | 姓名 |
|---|---|---|
| 客户 | liwei@demo.com | 李伟（远景智能科技） |
| 销售 | zhangna@demo.com | 张娜 |
| 仓库 | wangfang@demo.com | 王芳 |
| 法务 | chenmo@demo.com | 陈默 |
| 管理员 | admin@demo.com | 系统管理员 |

种子数据包含覆盖各状态的 7 张演示单（待审/准备中/待发货/已发货/试用中含反馈/待检验/已完结），
可直接登录各角色查看。也可在登录页点“客户自助注册”走一条全新链路。

## REST API 摘要

`POST /api/auth/login|register`、`GET /api/auth/me`、`GET /api/products`
借用单：`GET /api/loans`、`POST /api/loans`、`GET /api/loans/:id`、
`POST /api/loans/:id/{review,cancel,assign-unit,deposit/pay,deposit/refund,
contract/draft,contract/reject,contract/clear,contract/sign,ship,
ship-outbound/deliver,trial/start,feedback,return-ship,return-receive,inspect,complete}`

## 安全要点

- 密码 `scrypt` + 随机盐；JWT 存 httpOnly/sameSite cookie；所有写操作服务端鉴权 + 状态机校验 + 行归属校验。
- 财务/合同/仓储操作严格限定角色；法务和仓库视角做字段级脱敏。
