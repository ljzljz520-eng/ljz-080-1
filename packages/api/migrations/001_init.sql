-- ============================================================
-- 跨境样品借测系统 - 初始结构
-- ============================================================

-- ---------- 枚举 ----------
CREATE TYPE user_role AS ENUM ('customer', 'sales', 'warehouse', 'legal', 'admin');

-- 借用单状态（正向流程）
-- draft 草稿 -> submitted 待销售审核 -> approved 审核通过(准备中) -> ready 待发货
-- -> shipped 已发货 -> delivered 客户已签收 -> in_trial 试用中
-- -> return_shipped 客户已寄回 -> returned 仓库已收货 -> inspected 检验完成
-- -> completed 已完结(押金处理完)
-- 异常: rejected 审核驳回, overdue 逾期未还, cancelled 已取消
CREATE TYPE loan_status AS ENUM (
  'draft', 'submitted', 'approved', 'ready',
  'shipped', 'delivered', 'in_trial',
  'return_shipped', 'returned', 'inspected', 'completed',
  'rejected', 'overdue', 'cancelled'
);

CREATE TYPE shipment_direction AS ENUM ('outbound', 'return');
CREATE TYPE shipment_status AS ENUM ('in_transit', 'delivered');

CREATE TYPE deposit_status AS ENUM ('unpaid', 'paid', 'refunded', 'partially_deducted');
CREATE TYPE contract_status AS ENUM (
  'not_required', 'pending_legal', 'drafted', 'signed', 'rejected'
);
CREATE TYPE inspection_result AS ENUM ('pending', 'pass', 'damage');

-- ---------- 用户 ----------
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  company       TEXT,
  role          user_role NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 产品 / 样机 ----------
CREATE TABLE products (
  id              BIGSERIAL PRIMARY KEY,
  model           TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,
  deposit_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,  -- 标准押金
  description     TEXT
);

-- 样机实物（序列号级别）
CREATE TABLE sample_units (
  id           BIGSERIAL PRIMARY KEY,
  product_id   BIGINT NOT NULL REFERENCES products(id),
  serial_no    TEXT NOT NULL UNIQUE,
  -- available 在库 / on_loan 借出 / maintenance 维护 / retired 报废
  status       TEXT NOT NULL DEFAULT 'available'
               CHECK (status IN ('available', 'on_loan', 'maintenance', 'retired')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 借用申请单 ----------
CREATE TABLE loan_applications (
  id               BIGSERIAL PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  customer_id      BIGINT NOT NULL REFERENCES users(id),
  product_id       BIGINT NOT NULL REFERENCES products(id),
  unit_id          BIGINT REFERENCES sample_units(id),

  -- 申请信息（客户填写）
  destination_country TEXT NOT NULL,            -- 拿去哪个国家/地区
  test_purpose        TEXT NOT NULL,            -- 做什么测试
  test_purpose_detail TEXT,
  expected_return_date DATE NOT NULL,           -- 承诺什么时候寄回
  quantity            INT NOT NULL DEFAULT 1,

  -- 销售审核
  status          loan_status NOT NULL DEFAULT 'submitted',
  sales_id        BIGINT REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  review_note     TEXT,

  -- 跨境合规
  -- none 无需文件 / required 需要合同 / hold 合规暂扣
  compliance_flag TEXT NOT NULL DEFAULT 'required'
                  CHECK (compliance_flag IN ('required', 'cleared', 'hold')),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_loan_customer ON loan_applications(customer_id);
CREATE INDEX idx_loan_status ON loan_applications(status);

-- ---------- 状态流转时间线 ----------
CREATE TABLE status_events (
  id        BIGSERIAL PRIMARY KEY,
  loan_id   BIGINT NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
  from_status loan_status,
  to_status   loan_status NOT NULL,
  actor_id    BIGINT REFERENCES users(id),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_loan ON status_events(loan_id, created_at);

-- ---------- 押金 ----------
CREATE TABLE deposits (
  id          BIGSERIAL PRIMARY KEY,
  loan_id     BIGINT NOT NULL UNIQUE REFERENCES loan_applications(id) ON DELETE CASCADE,
  amount      NUMERIC(12,2) NOT NULL,
  status      deposit_status NOT NULL DEFAULT 'unpaid',
  paid_at     TIMESTAMPTZ,
  paid_method TEXT,
  recorded_by BIGINT REFERENCES users(id),
  refunded_at TIMESTAMPTZ,
  refund_note TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 合同 / 合规 ----------
CREATE TABLE contracts (
  id              BIGSERIAL PRIMARY KEY,
  loan_id         BIGINT NOT NULL UNIQUE REFERENCES loan_applications(id) ON DELETE CASCADE,
  status          contract_status NOT NULL DEFAULT 'pending_legal',
  title           TEXT,
  content         TEXT,                              -- 合同正文（法务维护）
  -- 合规要点：出口管制、禁运国家、测试用途限制等
  compliance_note TEXT,
  drafted_by      BIGINT REFERENCES users(id),
  drafted_at      TIMESTAMPTZ,
  signed_by       BIGINT REFERENCES users(id),       -- 客户确认签署
  signed_at       TIMESTAMPTZ,
  reject_reason   TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 物流（发货 + 寄回各一条） ----------
CREATE TABLE shipments (
  id               BIGSERIAL PRIMARY KEY,
  loan_id          BIGINT NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
  direction        shipment_direction NOT NULL,
  carrier          TEXT,
  tracking_no      TEXT,
  status           shipment_status NOT NULL DEFAULT 'in_transit',
  created_by       BIGINT REFERENCES users(id),      -- 仓库操作人
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at     TIMESTAMPTZ,
  UNIQUE (loan_id, direction)
);
CREATE INDEX idx_ship_tracking ON shipments(tracking_no);

-- ---------- 试用反馈 ----------
CREATE TABLE trial_feedbacks (
  id               BIGSERIAL PRIMARY KEY,
  loan_id          BIGINT NOT NULL UNIQUE REFERENCES loan_applications(id) ON DELETE CASCADE,
  rating           INT CHECK (rating BETWEEN 1 AND 5),
  usage_summary    TEXT,
  issues           TEXT,
  result           TEXT,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 归还检查 ----------
CREATE TABLE return_inspections (
  id              BIGSERIAL PRIMARY KEY,
  loan_id         BIGINT NOT NULL UNIQUE REFERENCES loan_applications(id) ON DELETE CASCADE,
  result          inspection_result NOT NULL DEFAULT 'pending',
  condition_note  TEXT,
  checked_by      BIGINT REFERENCES users(id),
  checked_at      TIMESTAMPTZ,
  deduction       NUMERIC(12,2) NOT NULL DEFAULT 0   -- 损坏扣款建议
);

-- 申请单编号序列: LA-YYYYMMDD-XXXX
CREATE SEQUENCE loan_code_seq;
