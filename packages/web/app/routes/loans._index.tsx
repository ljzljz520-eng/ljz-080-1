import { Link, useLoaderData, useSearchParams } from '@remix-run/react';
import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { apiFetch, requireUser } from '../api';
import { PageHead, StatusBadge, EmptyState } from '../components';

interface Loan {
  id: number; code: string; status: string; statusLabel: string;
  destinationCountry: string; testPurpose: string; expectedReturnDate?: string;
  product: { model: string; name: string };
  customer?: { name: string; company: string | null };
  contract?: { statusLabel: string }; deposit?: { statusLabel: string };
  shipments?: any[]; inspection?: { resultLabel: string };
  createdAt: string;
}

const FILTERS = [
  ['', '全部'], ['submitted', '待审核'], ['approved', '准备中'], ['ready', '待发货'],
  ['shipped', '已发货'], ['delivered', '已签收'], ['in_trial', '试用中'],
  ['return_shipped', '已寄回'], ['returned', '已收货'], ['inspected', '检验完成'],
  ['completed', '已完结'], ['rejected', '已驳回'], ['cancelled', '已取消'],
];

export async function loader({ request }: LoaderFunctionArgs) {
  const { user, token } = await requireUser(request);
  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? '';
  const q = url.searchParams.get('q') ?? '';
  const { loans } = await apiFetch<{ loans: Loan[] }>('/api/loans', {
    token,
    query: { status: status || undefined, q: q || undefined },
  });
  return json({ user, loans });
}

export default function LoansList() {
  const { user, loans } = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';

  const setStatus = (s: string) => {
    const next = new URLSearchParams(params);
    if (s) next.set('status', s); else next.delete('status');
    setParams(next);
  };

  return (
    <>
      <PageHead
        title={user.role === 'customer' ? '我的借用单' : '借用单管理'}
        sub={user.role === 'customer'
          ? '跟踪申请审核、押金、物流、试用反馈与归还检验全过程'
          : '按状态筛选，点击单据查看完整流转'}
        action={user.role === 'customer'
          ? <Link className="btn" to="/loans/new">＋ 新申请</Link> : undefined}
      />

      <div className="filter-bar">
        {FILTERS.map(([val, label]) => (
          <button key={val}
            className={'btn sm ' + (status === val ? '' : 'secondary')}
            onClick={() => setStatus(val)}>{label}</button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {loans.length === 0 ? <EmptyState text="没有符合条件的借用单" /> : (
          <table className="data">
            <thead>
              <tr>
                <th>单号</th>
                {user.role !== 'customer' && <th>客户</th>}
                <th>样机</th>
                <th>目的国家</th>
                {user.role === 'customer' && <th>预计寄回</th>}
                {user.role === 'sales' || user.role === 'admin' ? <th>押金</th> : null}
                {user.role === 'legal' ? <th>合同</th> : null}
                <th>状态</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loans.map((l) => (
                <tr className="clickable" key={l.id} onClick={() => (window.location.href = `/loans/${l.id}`)}>
                  <td className="mono">{l.code}</td>
                  {user.role !== 'customer' && (
                    <td>{l.customer?.name}<div className="muted" style={{ fontSize: 12 }}>{l.customer?.company}</div></td>
                  )}
                  <td>{l.product.model}<div className="muted" style={{ fontSize: 12 }}>{l.product.name}</div></td>
                  <td>{l.destinationCountry}</td>
                  {user.role === 'customer' && <td className="mono">{l.expectedReturnDate}</td>}
                  {(user.role === 'sales' || user.role === 'admin') && <td>{l.deposit?.statusLabel ?? '—'}</td>}
                  {user.role === 'legal' && <td>{l.contract?.statusLabel ?? '待起草'}</td>}
                  <td><StatusBadge status={l.status} label={l.statusLabel} /></td>
                  <td><Link className="btn sm secondary" to={`/loans/${l.id}`}>详情</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
