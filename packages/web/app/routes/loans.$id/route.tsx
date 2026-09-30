import { Link, useActionData, useLoaderData, useNavigation, type MetaFunction } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { apiFetch, requireUser } from '../../api';
import { FlowProgress, PageHead, StatusBadge, Timeline, Field } from '../../components';
import { GateChecklist } from './gate';
import { ActionPanel } from './actions';
import { ContractPanel } from './contract';
import { DepositPanel } from './deposit';
import { ShipmentPanel } from './shipment';
import { FeedbackPanel } from './feedback';
import { InspectionPanel } from './inspection';

export const meta: MetaFunction = () => [{ title: '借用单详情 · 跨境样品借测' }];

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { user, token } = await requireUser(request);
  const { loan } = await apiFetch<{ loan: any }>(`/api/loans/${params.id}`, { token });
  return json({ user, loan });
}

export async function action({ params, request }: ActionFunctionArgs) {
  const { token } = await requireUser(request);
  const f = await request.formData();
  const intent = String(f.get('intent'));
  const body: Record<string, unknown> = {};
  for (const [k, v] of f.entries()) {
    if (k === 'intent') continue;
    body[k] = v === '' ? undefined : v;
  }
  const routes: Record<string, { path: string; method?: string; numeric?: string[] }> = {
    cancel: { path: 'cancel', method: 'POST' },
    reviewApprove: { path: 'review', method: 'POST' },
    reviewReject: { path: 'review', method: 'POST' },
    assignUnit: { path: 'assign-unit', method: 'POST', numeric: ['unitId'] },
    depositPay: { path: 'deposit/pay', method: 'POST' },
    depositRefund: { path: 'deposit/refund', method: 'POST', numeric: ['deduct'] },
    contractDraft: { path: 'contract/draft', method: 'POST' },
    contractReject: { path: 'contract/reject', method: 'POST' },
    contractClear: { path: 'contract/clear', method: 'POST' },
    contractSign: { path: 'contract/sign', method: 'POST' },
    ship: { path: 'ship', method: 'POST' },
    outboundDeliver: { path: 'ship-outbound/deliver', method: 'POST' },
    trialStart: { path: 'trial/start', method: 'POST' },
    feedback: { path: 'feedback', method: 'POST', numeric: ['rating'] },
    returnShip: { path: 'return-ship', method: 'POST' },
    returnReceive: { path: 'return-receive', method: 'POST' },
    inspect: { path: 'inspect', method: 'POST', numeric: ['deduction'] },
    complete: { path: 'complete', method: 'POST' },
  };
  const r = routes[intent];
  if (!r) return json({ error: '未知操作' }, { status: 400 });
  const payload: Record<string, unknown> = { ...body };
  if (intent === 'reviewApprove') payload.approve = true;
  if (intent === 'reviewReject') payload.approve = false;
  if (intent === 'inspect') payload.result = body.result || 'pass';
  for (const key of r.numeric ?? []) {
    if (payload[key] !== undefined) payload[key] = Number(payload[key]);
  }
  try {
    await apiFetch(`/api/loans/${params.id}/${r.path}`, { token, method: 'POST', body: payload });
    return redirect(`/loans/${params.id}`);
  } catch (e: any) {
    return json({ error: e.message }, { status: e.status ?? 400 });
  }
}

export default function LoanDetail() {
  const { user, loan } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();

  return (
    <>
      <PageHead
        title={<><span className="mono">{loan.code}</span> <StatusBadge status={loan.status} label={loan.statusLabel} /></>}
        sub={`${loan.product.model} · ${loan.product.name} → ${loan.destinationCountry}`}
        action={<Link className="btn secondary" to={user.role === 'warehouse' ? '/warehouse' : user.role === 'legal' ? '/legal' : '/loans'}>← 返回列表</Link>}
      />

      {actionData?.error && <div className="form-error">{actionData.error}</div>}

      <div className="card">
        <FlowProgress current={loan.status}
          statuses={(loan.timeline ?? []).map((t: any) => t.to)} />
      </div>

      <div className="grid cols-2">
        <div>
          {/* 申请信息 */}
          <div className="card">
            <div className="card-title">📄 申请信息</div>
            <dl className="kv">
              <Field when={loan.customer}><dt>申请客户</dt><dd>{loan.customer?.name}（{loan.customer?.company}）</dd></Field>
              <dt>样机型号</dt><dd>{loan.product.model} · {loan.product.name}</dd>
              <Field when={loan.unit}><dt>样机序列号</dt><dd className="mono">{loan.unit?.serialNo ?? '未分配'}</dd></Field>
              <dt>目的国家</dt><dd>🌍 {loan.destinationCountry}</dd>
              <dt>测试用途</dt><dd>{loan.testPurpose}</dd>
              <Field when={loan.testPurposeDetail}><dt>测试详情</dt><dd>{loan.testPurposeDetail}</dd></Field>
              <Field when={loan.expectedReturnDate}><dt>预计寄回</dt><dd className="mono">{loan.expectedReturnDate}</dd></Field>
              <Field when={loan.sales}><dt>审核销售</dt><dd>{loan.sales?.name}{loan.reviewNote ? `：${loan.reviewNote}` : ''}</dd></Field>
            </dl>
          </div>

          <Field when={loan.gate}>
            <div className="card">
              <div className="card-title">🚦 发货门禁</div>
              <GateChecklist loan={loan} />
            </div>
          </Field>

          {/* 押金 */}
          <Field when={loan.deposit}><DepositPanel loan={loan} /></Field>

          {/* 合同 / 合规 */}
          <Field when={loan.contract}><ContractPanel loan={loan} /></Field>

          {/* 物流 */}
          <Field when={loan.shipments}><ShipmentPanel loan={loan} /></Field>

          {/* 试用反馈 */}
          {loan.feedback !== undefined && <FeedbackPanel loan={loan} />}

          {/* 归还检验 */}
          <Field when={loan.inspection}><InspectionPanel loan={loan} /></Field>
        </div>

        <div>
          <div className="card">
            <div className="card-title">⚡ 可执行操作</div>
            {nav.state === 'submitting' && <div className="section-tip">处理中…</div>}
            <ActionPanel loan={loan} role={user.role} />
          </div>

          <div className="card">
            <div className="card-title">🕒 流转时间线</div>
            <Timeline events={loan.timeline ?? []} />
          </div>
        </div>
      </div>
    </>
  );
}
