import { Link, useLoaderData } from '@remix-run/react';
import { json, redirect, type LoaderFunctionArgs } from '@remix-run/node';
import { apiFetch, requireUser } from '../api';
import { PageHead, StatusBadge, EmptyState } from '../components';

export async function loader({ request }: LoaderFunctionArgs) {
  const { user, token } = await requireUser(request);
  if (!['sales', 'admin'].includes(user.role)) throw redirect('/');
  const { loans } = await apiFetch<{ loans: any[] }>('/api/loans?status=submitted', { token });
  return json({ loans });
}

export default function SalesReview() {
  const { loans } = useLoaderData<typeof loader>();
  return (
    <>
      <PageHead title="待销售审核" sub={`共 ${loans.length} 单待审核。审核通过后进入合同/押金/样机准备，仓库才可见可发`} />
      <div className="card" style={{ padding: 0 }}>
        {loans.length === 0 ? <EmptyState text="所有申请都已处理 🎉" /> : (
          <table className="data">
            <thead><tr><th>单号</th><th>客户</th><th>样机</th><th>目的国</th><th>测试用途</th><th>申请时间</th><th></th></tr></thead>
            <tbody>
              {loans.map((l) => (
                <tr key={l.id}>
                  <td className="mono">{l.code}</td>
                  <td>{l.customer.name}<div className="muted" style={{ fontSize: 12 }}>{l.customer.company}</div></td>
                  <td>{l.product.model}<div className="muted" style={{ fontSize: 12 }}>{l.product.name}</div></td>
                  <td>🌍 {l.destinationCountry}</td>
                  <td style={{ maxWidth: 240 }}>{l.testPurpose}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{new Date(l.createdAt).toLocaleDateString('zh-CN')}</td>
                  <td><Link className="btn sm" to={`/loans/${l.id}`}>审核 →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
