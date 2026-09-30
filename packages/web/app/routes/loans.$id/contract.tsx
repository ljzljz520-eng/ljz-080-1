const STATUS_BADGE: Record<string, string> = {
  not_required: 'gray', pending_legal: 'amber', drafted: 'blue', signed: 'green', rejected: 'red',
};

export function ContractPanel({ loan }: { loan: any }) {
  const c = loan.contract;
  return (
    <div className="card">
      <div className="card-title">
        ⚖️ 合同与合规
        <span className={'badge ' + (STATUS_BADGE[c.status] ?? 'gray')} style={{ marginLeft: 'auto' }}>{c.statusLabel}</span>
      </div>
      {c.status === 'pending_legal' && (
        <div className="section-tip">合同待法务起草。跨境借用须完成出口管制与用途合规审查。</div>
      )}
      {c.status === 'rejected' && (
        <div className="form-error">合规驳回：{c.rejectReason}</div>
      )}
      {c.title && (
        <>
          <h3>{c.title}</h3>
          <div className="doc-box">{c.content}</div>
        </>
      )}
      {c.complianceNote && (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>合规审查意见</div>
          <div className="doc-box" style={{ background: '#f6f3ff', borderColor: '#e3d7fb' }}>{c.complianceNote}</div>
        </div>
      )}
      <dl className="kv" style={{ marginTop: 12 }}>
        <dt>起草时间</dt><dd>{c.draftedAt ? new Date(c.draftedAt).toLocaleString('zh-CN', { hour12: false }) : '—'}</dd>
        <dt>签署时间</dt><dd>{c.signedAt ? new Date(c.signedAt).toLocaleString('zh-CN', { hour12: false }) : '—'}</dd>
      </dl>
    </div>
  );
}
