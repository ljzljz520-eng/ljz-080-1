import { useEffect, useState } from 'react';

// 按角色 + 当前状态返回该用户能执行的操作
export function ActionPanel({ loan, role }: { loan: any; role: string }) {
  const s = loan.status;
  const blocks: React.ReactNode[] = [];

  // ---------- 客户 ----------
  if (role === 'customer') {
    if (['submitted', 'approved', 'ready'].includes(s))
      blocks.push(<CancelBtn key="cancel" />);
    if (s === 'delivered')
      blocks.push(<PostBtn key="ts" intent="trialStart" className="btn" label="▶ 确认开始试用" />);
    if (['in_trial', 'overdue'].includes(s))
      blocks.push(<ReturnShipForm key="rs" />);
    if (loan.contract?.status === 'drafted')
      blocks.push(<PostBtn key="sign" intent="contractSign" className="btn success" label="✍️ 在线签署合同" confirm="签署即表示同意全部合同条款与合规要求，确认签署？" />);
    if (['in_trial', 'overdue', 'return_shipped'].includes(s))
      blocks.push(<FeedbackForm key="fb" existing={loan.feedback} />);
  }

  // ---------- 销售 / 管理员 ----------
  if (role === 'sales' || role === 'admin') {
    if (s === 'submitted') blocks.push(<ReviewForm key="rv" />);
    if (['approved', 'ready'].includes(s)) blocks.push(<AssignUnitForm key="as" loan={loan} />);
    if (loan.deposit?.status === 'unpaid' && ['approved', 'ready'].includes(s))
      blocks.push(<PostBtn key="dp" intent="depositPay" className="btn success" label="💰 登记押金到账" />);
    if (['inspected'].includes(s) && loan.deposit && ['paid', 'partially_deducted'].includes(loan.deposit.status))
      blocks.push(<RefundForm key="rf" deposit={loan.deposit} inspection={loan.inspection} />);
    if (s === 'inspected' && (loan.deposit?.status === 'refunded' || loan.deposit?.status === 'partially_deducted'))
      blocks.push(<PostBtn key="done" intent="complete" className="btn success" label="✔ 结单（流程完结）" />);
    if (['submitted', 'approved', 'ready'].includes(s))
      blocks.push(<CancelBtn key="cancel" />);
  }

  // ---------- 仓库 ----------
  if (role === 'warehouse') {
    if (s === 'ready') blocks.push(<ShipForm key="ship" />);
    if (s === 'shipped')
      blocks.push(<PostBtn key="od" intent="outboundDeliver" className="btn success" label="📦 登记客户签收" />);
    if (s === 'return_shipped')
      blocks.push(<PostBtn key="rr" intent="returnReceive" className="btn" label="📥 确认签收回货" />);
    if (s === 'returned') blocks.push(<InspectForm key="ins" />);
  }

  // ---------- 法务 ----------
  if (role === 'legal') {
    const cs = loan.contract?.status;
    if (['pending_legal', 'rejected', 'drafted'].includes(cs))
      blocks.push(<LegalDraftForm key="draft" loan={loan} />);
    if (cs === 'drafted' || loan.complianceFlag === 'required')
      blocks.push(<LegalRejectForm key="rej" />);
    if (loan.complianceFlag === 'hold')
      blocks.push(<PostBtn key="clear" intent="contractClear" className="btn success" label="解除合规暂扣" />);
  }

  if (blocks.length === 0)
    return <div className="muted">当前没有需要你处理的操作。<br />
      {s === 'completed' && '该借用单已完结。'}
      {s === 'cancelled' && '该借用单已取消。'}
      {s === 'rejected' && '该申请已被驳回。'}
    </div>;

  return <div className="btn-row" style={{ alignItems: 'stretch' }}>{blocks}</div>;
}

function PostBtn({ intent, label, className = 'btn', confirm, name = '', value = '' }:
  { intent: string; label: string; className?: string; confirm?: string; name?: string; value?: string }) {
  return (
    <form method="post" onSubmit={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}>
      <input type="hidden" name="intent" value={intent} />
      {name && <input type="hidden" name={name} value={value} />}
      <button className={className}>{label}</button>
    </form>
  );
}

function CancelBtn() {
  return <PostBtn intent="cancel" label="取消申请" className="btn danger" confirm="确认取消该借用申请？" />;
}

function ReviewForm() {
  const [note, setNote] = useState('');
  const [intent, setIntent] = useState('');
  return (
    <form method="post" style={{ width: '100%' }}
      onSubmit={(e) => {
        if (intent === 'reviewReject' && !note.trim()) {
          e.preventDefault();
          alert('驳回时请填写原因');
        }
      }}>
      <input type="hidden" name="intent" value={intent} />
      <textarea rows={2} placeholder="审核备注（驳回时必填原因）" value={note}
        onChange={(e) => setNote(e.target.value)} name="note" style={{ marginBottom: 8 }} />
      <div className="btn-row">
        <button type="submit" className="btn success" onClick={() => setIntent('reviewApprove')}>✔ 审核通过</button>
        <button type="submit" className="btn danger" onClick={() => setIntent('reviewReject')}>✖ 驳回</button>
      </div>
    </form>
  );
}

function AssignUnitForm({ loan }: { loan: any }) {
  const [units, setUnits] = useState<any[] | null>(null);
  const [unitId, setUnitId] = useState<number | ''>(loan.unit?.id ?? '');
  useEffect(() => {
    fetch(`/api-proxy/loans/${loan.id}/available-units`)
      .then((r) => (r.ok ? r.json() : { units: [] }))
      .then((d) => setUnits(d.units ?? []));
  }, [loan.id]);
  return (
    <form method="post" className="btn-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <input type="hidden" name="intent" value="assignUnit" />
      <select name="unitId" value={unitId} onChange={(e) => setUnitId(Number(e.target.value))}>
        <option value="" disabled>选择可用样机序列号…</option>
        {units?.map((u) => (
          <option key={u.id} value={u.id} disabled={u.status !== 'available' && u.id !== loan.unit?.id}>
            {u.serialNo}（{u.status === 'available' ? '在库可用' : u.status === 'on_loan' ? '借出中' : u.status}）
          </option>
        ))}
      </select>
      <button className="btn secondary" disabled={unitId === ''}>🔧 分配样机</button>
    </form>
  );
}

function ShipForm() {
  return (
    <form method="post" style={{ width: '100%' }}>
      <input type="hidden" name="intent" value="ship" />
      <div className="btn-row" style={{ marginBottom: 8 }}>
        <input name="carrier" placeholder="承运商（DHL/FedEx/顺丰…）" required />
        <input name="trackingNo" placeholder="物流单号" required />
      </div>
      <button className="btn">🚚 确认出库发货</button>
    </form>
  );
}

function ReturnShipForm() {
  return (
    <form method="post" style={{ width: '100%' }}>
      <input type="hidden" name="intent" value="returnShip" />
      <div style={{ marginBottom: 6, fontWeight: 500 }}>登记归还物流</div>
      <div className="btn-row" style={{ marginBottom: 8 }}>
        <input name="carrier" placeholder="承运商" required />
        <input name="trackingNo" placeholder="物流单号" required />
      </div>
      <button className="btn">📤 提交寄回信息</button>
    </form>
  );
}

function FeedbackForm({ existing }: { existing: any }) {
  return (
    <details style={{ width: '100%' }}>
      <summary className="btn secondary" style={{ display: 'inline-block' }}>📝 提交 / 更新试用反馈</summary>
      <form method="post" style={{ marginTop: 10 }}>
        <input type="hidden" name="intent" value="feedback" />
        <label className="field">
          <span className="lbl">综合评分</span>
          <select name="rating" defaultValue={existing?.rating ?? 5}>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'★'.repeat(n)}{'☆'.repeat(5 - n)}（{n} 分）</option>)}
          </select>
        </label>
        <label className="field"><span className="lbl">使用情况 *</span>
          <textarea name="usageSummary" rows={2} required defaultValue={existing?.usage_summary ?? ''} placeholder="测试如何使用、运行情况" /></label>
        <label className="field"><span className="lbl">遇到的问题</span>
          <textarea name="issues" rows={2} defaultValue={existing?.issues ?? ''} /></label>
        <label className="field"><span className="lbl">测试结论 / 采购意向</span>
          <textarea name="result" rows={2} defaultValue={existing?.result ?? ''} /></label>
        <button className="btn secondary">提交反馈</button>
      </form>
    </details>
  );
}

function InspectForm() {
  const [result, setResult] = useState<'pass' | 'damage'>('pass');
  return (
    <form method="post" style={{ width: '100%' }}>
      <input type="hidden" name="intent" value="inspect" />
      <div className="btn-row" style={{ marginBottom: 8 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="radio" name="result" value="pass" checked={result === 'pass'} onChange={() => setResult('pass')} style={{ width: 'auto' }} /> 完好
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="radio" name="result" value="damage" checked={result === 'damage'} onChange={() => setResult('damage')} style={{ width: 'auto' }} /> 有损坏
        </label>
      </div>
      <textarea name="conditionNote" rows={2} placeholder="检验情况说明（外观/功能/配件）" style={{ marginBottom: 8 }} />
      {result === 'damage' && (
        <input name="deduction" type="number" min={0} step="0.01" placeholder="建议扣款金额（¥）" style={{ marginBottom: 8 }} />
      )}
      <button className="btn">🔍 提交检验结果</button>
    </form>
  );
}

function RefundForm({ deposit, inspection }: { deposit: any; inspection: any }) {
  return (
    <details style={{ width: '100%' }} open={inspection?.result === 'damage'}>
      <summary className="btn success" style={{ display: 'inline-block' }}>💸 处理押金退还</summary>
      <form method="post" style={{ marginTop: 10 }}>
        <input type="hidden" name="intent" value="depositRefund" />
        <label className="field"><span className="lbl">扣款金额（¥）</span>
          <input name="deduct" type="number" min={0} max={deposit.amount} step="0.01"
            defaultValue={inspection?.deduction ?? 0} /></label>
        <label className="field"><span className="lbl">退款备注</span>
          <input name="note" defaultValue={inspection?.result === 'damage' ? '损坏扣款后退还差额' : '完好归还，全额退还'} /></label>
        <button className="btn success">确认退款</button>
      </form>
    </details>
  );
}

function LegalDraftForm({ loan }: { loan: any }) {
  return (
    <details style={{ width: '100%' }} open={loan.contract?.status === 'pending_legal' || loan.contract?.status === 'rejected'}>
      <summary className="btn" style={{ display: 'inline-block' }}>📃 起草 / 修改合同</summary>
      <form method="post" style={{ marginTop: 10 }}>
        <input type="hidden" name="intent" value="contractDraft" />
        <label className="field"><span className="lbl">合同标题</span>
          <input name="title" required defaultValue={loan.contract?.title ?? '跨境样机借用及测试协议'} /></label>
        <label className="field"><span className="lbl">合同正文</span>
          <textarea name="content" rows={6} required
            defaultValue={loan.contract?.content ?? DEFAULT_CONTRACT(loan)} /></label>
        <label className="field"><span className="lbl">合规审查意见（出口管制 / 用途限制）</span>
          <textarea name="complianceNote" rows={3} defaultValue={loan.contract?.compliance_note ?? ''}
            placeholder={`目的国「${loan.destinationCountry}」出口管制核查结论；测试用途「${loan.testPurpose}」的限制要求`} /></label>
        <button className="btn">提交合同，待客户签署</button>
      </form>
    </details>
  );
}

function LegalRejectForm() {
  return (
    <details>
      <summary className="btn danger" style={{ display: 'inline-block' }}>⛔ 合规驳回 / 暂扣</summary>
      <form method="post" style={{ marginTop: 10 }}>
        <input type="hidden" name="intent" value="contractReject" />
        <textarea name="reason" rows={2} required placeholder="驳回原因：如目的国在出口管制清单、用途存在军民两用风险等" style={{ marginBottom: 8 }} />
        <button className="btn danger">确认合规驳回</button>
      </form>
    </details>
  );
}

function DEFAULT_CONTRACT(loan: any) {
  return `借用样机：${loan.product.model}（${loan.product.name}）
使用国家/地区：${loan.destinationCountry}
测试用途：${loan.testPurpose}
${loan.testPurposeDetail ? '测试详情：' + loan.testPurposeDetail + '\n' : ''}
第一条 样机所有权归出借方，借用方仅可在约定国家内用于约定测试用途，不得转借、出租、改装或用于任何军事用途。
第二条 借用方不得将样机出口、再出口或转移至联合国及相关出口管制清单所列禁运国家/地区。
第三条 借用方应妥善保管样机，于 ${loan.expectedReturnDate} 前按约定物流寄回；运输风险按 INCOTERMS DAP 划分。
第四条 样机如有损坏、灭失，借用方同意从押金中按实际损失扣除。
第五条 测试期间产生的任何数据、成果及知识产权归属双方另行书面约定。`;
}
