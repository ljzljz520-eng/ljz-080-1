import { Link, useLoaderData } from '@remix-run/react';
import { json, redirect, type LoaderFunctionArgs } from '@remix-run/node';
import { apiFetch, requireUser } from '../api';
import { PageHead, StatusBadge, EmptyState } from '../components';

const CONTRACT_BADGE: Record<string, string> = {
  pending_legal: 'amber', drafted: 'blue', signed: 'green', rejected: 'red', not_required: 'gray',
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { user, token } = await requireUser(request);
  if (user.role !== 'legal') throw redirect('/');
  const { loans } = await apiFetch<{ loans: any[] }>('/api/loans', { token });
  const active = loans.filter((l) => !['completed', 'cancelled', 'rejected'].includes(l.status));
  return json({
    pending: active.filter((l) => ['pending_legal', 'rejected'].includes(l.contract?.status)),
    drafted: active.filter((l) => l.contract?.status === 'drafted'),
    hold: active.filter((l) => l.complianceFlag === 'hold'),
    signed: active.filter((l) => l.contract?.status === 'signed'),
  });
}

export default function Legal() {
  const d = useLoaderData<typeof loader>();
  return (
    <>
      <PageHead title="合同与合规工作台" sub="你只能看到借用单的合同、合规与测试用途信息；押金、物流、检验等商务/仓储信息已隔离" />
      <Section title="① 待起草 / 被退回的合同" loans={d.pending} />
      <Section title="② 已起草·待客户签署" loans={d.drafted} />
      <Section title="③ 合规暂扣中" loans={d.hold} />
      <Section title="④ 已签署（留档）" loans={d.signed} />
    </>
  );
}

function Section({ title, loans }: { title: string; loans: any[] }) {
  return (
    <div className="card">
      <div className="card-title">{title}<span className="badge gray" style={{ marginLeft: 8 }}>{loans.length}</span></div>
      {loans.length === 0 ? <EmptyState text="暂无单据" /> : (
        <table className="data">
          <thead><tr><th>单号</th><th>客户</th><th>样机</th><th>目的国</th><th>测试用途</th><th>合同状态</th><th>流程</th><th></th></tr></thead>
          <tbody>
            {loans.map((l) => (
              <tr key={l.id}>
                <td className="mono">{l.code}</td>
                <td>{l.customer?.name}<div className="muted" style={{ fontSize: 12 }}>{l.customer?.company}</div></td>
                <td>{l.product.model}</td>
                <td>{l.destinationCountry}</td>
                <td style={{ maxWidth: 220 }}>{l.testPurpose}</td>
                <td><span className={'badge ' + (CONTRACT_BADGE[l.contract?.status] ?? 'gray')}>{l.contract?.statusLabel ?? '—'}</span></td>
                <td><StatusBadge status={l.status} label={l.statusLabel} /></td>
                <td><Link className="btn sm" to={`/loans/${l.id}`}>处理 →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
