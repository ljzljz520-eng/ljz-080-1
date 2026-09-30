import type { ReactNode } from 'react';
import { FLOW_ORDER } from './flow-constants';

export const STATUS_LABEL: Record<string, string> = {
  draft: '草稿', submitted: '待销售审核', approved: '审核通过·准备中', ready: '待仓库发货',
  shipped: '已发货', delivered: '客户已签收', in_trial: '试用中',
  return_shipped: '客户已寄回', returned: '仓库已收货', inspected: '归还检验完成',
  completed: '已完结', rejected: '审核驳回', overdue: '逾期未还', cancelled: '已取消',
};

const BADGE_COLOR: Record<string, string> = {
  submitted: 'amber', approved: 'blue', ready: 'blue',
  shipped: 'blue', delivered: 'blue', in_trial: 'blue',
  return_shipped: 'amber', returned: 'amber', inspected: 'amber',
  completed: 'green', rejected: 'red', overdue: 'red', cancelled: 'gray', draft: 'gray',
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={'badge ' + (BADGE_COLOR[status] ?? 'gray')}>
      <span className="dot" />
      {label ?? STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function FlowProgress({ current, statuses }: { current: string; statuses?: string[] }) {
  // 异常状态（驳回/取消/逾期）不画正向进度条
  if (['rejected', 'cancelled', 'overdue'].includes(current)) return null;
  const reached = new Set<string>(statuses ?? [current]);
  const curIdx = FLOW_ORDER.indexOf(current as any);
  return (
    <div className="flow">
      {FLOW_ORDER.map((s, i) => {
        const done = i < curIdx || reached.has(s);
        const isCur = i === curIdx;
        return (
          <div className={'step' + (isCur ? ' current' : done ? ' done' : '')} key={s}>
            <div className="node">{done && !isCur ? '✓' : i + 1}</div>
            <div className="lbl">{STATUS_LABEL[s]}</div>
          </div>
        );
      })}
    </div>
  );
}

export interface TimelineEvent {
  to: string; toLabel: string; actorName: string; note: string | null; at: string;
}
export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ul className="timeline">
      {events.map((e, i) => (
        <li key={i}>
          <div className="t-title">{e.toLabel}</div>
          <div className="t-meta">
            {new Date(e.at).toLocaleString('zh-CN', { hour12: false })} · {e.actorName}
          </div>
          {e.note && <div className="t-note">{e.note}</div>}
        </li>
      ))}
    </ul>
  );
}

// 仅当后端按角色下发了字段时才渲染，保证前端也不越权显示
export function Field({ when, children }: { when: unknown; children: ReactNode }) {
  return when !== undefined && when !== null ? <>{children}</> : null;
}

export function PageHead({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="empty">📭 {text}</div>;
}

export function Money({ cents }: { cents: number }) {
  return <>¥{cents.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</>;
}
