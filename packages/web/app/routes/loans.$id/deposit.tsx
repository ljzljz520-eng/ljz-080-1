const STATUS_BADGE: Record<string, string> = {
  unpaid: 'amber', paid: 'blue', refunded: 'green', partially_deducted: 'amber',
};

export function DepositPanel({ loan }: { loan: any }) {
  const d = loan.deposit;
  return (
    <div className="card">
      <div className="card-title">
        💰 押金
        <span className={'badge ' + (STATUS_BADGE[d.status] ?? 'gray')} style={{ marginLeft: 'auto' }}>{d.statusLabel}</span>
      </div>
      <dl className="kv">
        <dt>押金金额</dt><dd style={{ fontSize: 16, fontWeight: 600 }}>¥{d.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</dd>
        <dt>到账时间</dt><dd>{d.paidAt ? new Date(d.paidAt).toLocaleString('zh-CN', { hour12: false }) : '—'}</dd>
        <dt>支付方式</dt><dd>{d.paidMethod ?? '—'}</dd>
        <dt>退还时间</dt><dd>{d.refundedAt ? new Date(d.refundedAt).toLocaleString('zh-CN', { hour12: false }) : '—'}</dd>
      </dl>
      {d.refundNote && <div className="section-tip" style={{ marginBottom: 0, marginTop: 10 }}>{d.refundNote}</div>}
    </div>
  );
}
