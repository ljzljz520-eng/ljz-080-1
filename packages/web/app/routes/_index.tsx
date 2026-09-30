import { Link, useLoaderData } from '@remix-run/react';
import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { apiFetch, requireUser } from '../api';
import { PageHead, StatusBadge, EmptyState } from '../components';

interface Loan {
  id: number; code: string; status: string; statusLabel: string;
  destinationCountry: string; testPurpose: string; expectedReturnDate?: string;
  product: { model: string; name: string }; customer?: { name: string; company: string | null };
  contract?: { status: string; statusLabel: string }; deposit?: { status: string; statusLabel: string };
  shipments?: any[]; createdAt: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { user, token } = await requireUser(request);
  const { loans } = await apiFetch<{ loans: Loan[] }>('/api/loans', { token });
  return json({ user, loans });
}

const ROLE_GREETING: Record<string, string> = {
  customer: '欢迎使用样机借测服务',
  sales: '销售审核工作台',
  warehouse: '仓库收发工作台',
  legal: '合同与合规工作台',
  admin: '系统管理总览',
};

export default function Dashboard() {
  const { user, loans } = useLoaderData<typeof loader>();

  // 各角色关注的队列
  const queue = (() => {
    switch (user.role) {
      case 'customer':
        return { title: '我的最新借用单', items: loans.slice(0, 6), to: '/loans' };
      case 'sales':
      case 'admin': {
        const focus = loans.filter((l) =>
          ['submitted', 'approved', 'ready', 'returned', 'inspected'].includes(l.status));
        return { title: '待处理事项', items: focus.slice(0, 8), to: '/loans' };
      }
      case 'warehouse': {
        const focus = loans.filter((l) => ['ready', 'shipped', 'return_shipped', 'returned'].includes(l.status));
        return { title: '待发货 / 待收货', items: focus.slice(0, 8), to: '/warehouse' };
      }
      case 'legal': {
        const focus = loans.filter((l) =>
          ['pending_legal', 'drafted', 'rejected'].includes(l.contract?.status ?? '') &&
          !['completed', 'cancelled'].includes(l.status));
        return { title: '待处理合同', items: focus.slice(0, 8), to: '/legal' };
      }
    }
  })();

  const stats = [
    { num: loans.length, lbl: '借用单总数' },
    { num: loans.filter((l) => ['shipped', 'delivered', 'in_trial', 'return_shipped'].includes(l.status)).length, lbl: '在途/试用中' },
    { num: loans.filter((l) => ['ready'].includes(l.status)).length, lbl: '待发货' },
    { num: loans.filter((l) => ['completed'].includes(l.status)).length, lbl: '已完结' },
  ];

  return (
    <>
      <PageHead title={ROLE_GREETING[user.role]} sub={`${user.name}，今天是 ${new Date().toLocaleDateString('zh-CN')}`}
        action={user.role === 'customer'
          ? <Link className="btn" to="/loans/new">＋ 申请借样机</Link>
          : undefined} />

      <div className="grid cols-3" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 18 }}>
        {stats.map((s) => (
          <div className="card stat" key={s.lbl} style={{ marginBottom: 0 }}>
            <span className="num">{s.num}</span><span className="lbl">{s.lbl}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">
          {queue!.title}
          <Link to={queue!.to} style={{ marginLeft: 'auto', fontSize: 13 }}>查看全部 →</Link>
        </div>
        {queue!.items.length === 0 ? <EmptyState text="暂无待处理事项" /> : (
          <table className="data">
            <thead>
              <tr><th>单号</th><th>{user.role === 'customer' ? '样机' : '客户 / 样机'}</th>
                {user.role === 'legal' && <th>目的国家</th>}
                <th>状态</th><th>下一步</th></tr>
            </thead>
            <tbody>
              {queue!.items.map((l) => (
                <tr className="clickable" key={l.id} onClick={() => (window.location.href = `/loans/${l.id}`)}>
                  <td className="mono">{l.code}</td>
                  <td>
                    {user.role !== 'customer' && <div>{l.customer?.name} · {l.customer?.company}</div>}
                    <div className="muted">{l.product.model} {l.product.name}</div>
                  </td>
                  {user.role === 'legal' && <td>{l.destinationCountry}</td>}
                  <td><StatusBadge status={l.status} label={l.statusLabel} /></td>
                  <td className="muted">{nextStep(user.role, l)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function nextStep(role: string, l: Loan): string {
  if (role === 'customer') {
    return { submitted: '等待销售审核', approved: '签合同 / 付押金', ready: '等待仓库发货', shipped: '等待签收', delivered: '开始试用', in_trial: '提交反馈并寄回', return_shipped: '等待仓库收货', returned: '等待检验', inspected: '等待押金处理', completed: '已完结' }[l.status] ?? '—';
  }
  if (role === 'sales' || role === 'admin') {
    return { submitted: '立即审核', approved: '跟进合同/押金/样机分配', ready: '等待仓库发货', inspected: '退还押金并结单' }[l.status] ?? '—';
  }
  if (role === 'warehouse') {
    return { ready: '安排出库发货', shipped: '等待/登记签收', return_shipped: '确认收货并检验' }[l.status] ?? '—';
  }
  if (role === 'legal') return l.contract?.statusLabel ? `合同：${l.contract.statusLabel}` : '起草合同';
  return '—';
}
