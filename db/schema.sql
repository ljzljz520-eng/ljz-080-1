-- ============================================================
-- 跨境样品借测系统 - 数据库结构
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- 可重复执行：先清理依赖表
DROP TABLE IF EXISTS application_events CASCADE;
DROP TABLE IF EXISTS trial_feedbacks CASCADE;
DROP TABLE IF EXISTS loan_applications CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS users CASCADE;



-- ---------- 枚举 ----------
DROP TYPE IF EXISTS user_role CASCADE;
CREATE TYPE user_role AS ENUM ('customer', 'sales', 'legal', 'warehouse');

DROP TYPE IF EXISTS app_status CASCADE;
CREATE TYPE app_status AS ENUM (
  'draft',
  'pending_sales',      -- 等待销售审核
  'pending_legal',      -- 销售通过，等待法务合规确认
  'approved',           -- 法务通过，等待押金/发货
  'deposit_paid',       -- 押金已到账，仓库可发货
  'shipped',            -- 已发货
  'in_trial',           -- 客户签收/试用中
  'return_shipped',     -- 客户已寄回
  'returned',           -- 仓库签收，待质检
  'completed',          -- 质检完成、押金结算，流程结束
  'rejected',           -- 销售驳回
  'compliance_blocked', -- 法务合规拦截
  'overdue'             -- 超期未还
);

DROP TYPE IF EXISTS deposit_status CASCADE;
CREATE TYPE deposit_status AS ENUM ('unpaid', 'paid', 'refunded', 'partially_refunded', 'forfeited');
DROP TYPE IF EXISTS inspection_result CASCADE;
CREATE TYPE inspection_result AS ENUM ('good', 'damaged', 'lost');

-- ---------- 用户 ----------
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          user_role NOT NULL,
  company       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 样机产品 ----------
CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model           TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  description     TEXT,
  unit_value_usd  NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_qty       INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 借测申请单 ----------
CREATE TABLE loan_applications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  TEXT NOT NULL UNIQUE,
  customer_id           UUID NOT NULL REFERENCES users(id),

  -- 申请内容
  product_id            UUID NOT NULL REFERENCES products(id),
  quantity              INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  destination_country   TEXT NOT NULL,
  test_purpose          TEXT NOT NULL,
  return_date           DATE NOT NULL,
  remark                TEXT,

  -- 状态
  status                app_status NOT NULL DEFAULT 'pending_sales',

  -- 销售审核
  sales_reviewer_id     UUID REFERENCES users(id),
  sales_reviewed_at     TIMESTAMPTZ,
  sales_comment        TEXT,

  -- 法务/合规
  legal_reviewer_id     UUID REFERENCES users(id),
  legal_reviewed_at     TIMESTAMPTZ,
  compliance_passed     BOOLEAN,
  contract_no           TEXT,
  contract_terms        TEXT,          -- 合同关键条款摘要
  export_classification TEXT,          -- 出口管制分类 (ECCN/HS)
  compliance_notes      TEXT,

  -- 押金
  deposit_amount_usd    NUMERIC(12,2),
  deposit_status        deposit_status NOT NULL DEFAULT 'unpaid',
  deposit_paid_at       TIMESTAMPTZ,
  deposit_refund_amount NUMERIC(12,2),
  deposit_settled_at    TIMESTAMPTZ,

  -- 物流
  outbound_tracking_no  TEXT,
  outbound_carrier      TEXT,
  shipped_at            TIMESTAMPTZ,
  delivered_at          TIMESTAMPTZ,
  inbound_tracking_no   TEXT,
  inbound_carrier       TEXT,
  return_received_at    TIMESTAMPTZ,

  -- 归还质检
  inspection_result     inspection_result,
  inspection_notes      TEXT,
  inspected_by          UUID REFERENCES users(id),
  inspected_at          TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_loan_customer ON loan_applications(customer_id);
CREATE INDEX idx_loan_status   ON loan_applications(status);

-- ---------- 试用反馈 ----------
CREATE TABLE trial_feedbacks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
  rating         INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content        TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 全流程时间线事件（审计轨迹） ----------
CREATE TABLE application_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
  event_type     TEXT NOT NULL,
  from_status    app_status,
  to_status      app_status,
  actor_id       UUID REFERENCES users(id),
  actor_role     user_role,
  detail         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_app ON application_events(application_id, created_at);

-- ---------- updated_at 自动维护 ----------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_loan_touch
BEFORE UPDATE ON loan_applications
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
