import { Link, useLoaderData } from '@remix-run/react';
import { json, redirect, type LoaderFunctionArgs } from '@remix-run/node';
import { apiFetch, requireUser } from '../api';
import { PageHead, StatusBadge, EmptyState } from '../components';

export async function loader({ request }: LoaderFunctionArgs) {
  const { user, token } = await requireUser(request);
  if (user.role !== 'warehouse') throw redirect('/');
  const { loans } = await apiFetch<{ loans: any[] }>('/api/loans', { token });
  return json({
    queues: {
      ready: loans.filter((l) => l.status === 'ready'),
      shipped: loans.filter((l) => l.status === 'shipped'),
      returning: loans.filter((l) => ['return_shipped', 'returned'].includes(l.status)),
    },
  });
}

export default function Warehouse() {
  const { queues } = useLoaderData<typeof loader>();
  return (
    <>
      <PageHead title="仓库收发工作台" sub="只处理发货、签收与归还收货检验；商务与合同信息对你不可见" />
      <Queue title="① 待发货（门禁已满足）" loans={queues.ready} action="去发货" />
      <Queue title="② 已发货·待客户签收" loans={queues.shipped} action="登记签收" />
      <Queue title="③ 归还在途 / 待检验" loans={queues.returning} action="去处理" />
    </>
  );
}

function Queue({ title, loans, action }: { title: string; loans: any[]; action: string }) {
  return (
    <div className="card">
      <div className="card-title">{title}<span className="badge gray" style={{ marginLeft: 8 }}>{loans.length}</span></div>
      {loans.length === 0 ? <EmptyState text="暂无单据" /> : (
        <table className="data">
          <thead><tr><th>单号</th><th>客户</th><th>样机 / 序列号</th><th>目的国</th><th>应寄回</th><th>状态</th><th></th></tr></thead>
          <tbody>
            {loans.map((l) => (
              <tr key={l.id}>
                <td className="mono">{l.code}</td>
                <td>{l.customer?.name}<div className="muted" style={{ fontSize: 12 }}>{l.customer?.company}</div></td>
                <td>{l.product.model}<div className="mono" style={{ fontSize: 12 }}>{l.unit?.serialNo ?? '未分配'}</div></td>
                <td>{l.destinationCountry}</td>
                <td className="mono">{l.expectedReturnDate}</td>
                <td><StatusBadge status={l.status} label={l.statusLabel} /></td>
                <td><Link className="btn sm" to={`/loans/${l.id}`}>{action} →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
