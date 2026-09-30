export function ShipmentPanel({ loan }: { loan: any }) {
  const shipments = loan.shipments ?? [];
  return (
    <div className="card">
      <div className="card-title">🚚 物流信息</div>
      {shipments.length === 0 && <div className="muted">暂无物流记录。门禁满足后由仓库安排出库发货。</div>}
      {shipments.map((s: any) => (
        <div key={s.id} style={{
          border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 10,
          borderLeft: `4px solid ${s.direction === 'outbound' ? 'var(--primary)' : 'var(--amber)'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <strong>{s.direction === 'outbound' ? '📦 出库发货（→ 客户）' : '📤 归还寄回（→ 仓库）'}</strong>
            <span className={'badge ' + (s.status === 'delivered' ? 'green' : 'blue')}>{s.statusLabel}</span>
          </div>
          <dl className="kv" style={{ gridTemplateColumns: '80px 1fr' }}>
            <dt>承运商</dt><dd>{s.carrier}</dd>
            <dt>单号</dt><dd className="mono">{s.trackingNo}</dd>
            <dt>操作人</dt><dd>{s.operatorName ?? '—'}</dd>
            <dt>时间</dt><dd>{new Date(s.createdAt).toLocaleString('zh-CN', { hour12: false })}</dd>
            {s.deliveredAt && <><dt>签收</dt><dd>{new Date(s.deliveredAt).toLocaleString('zh-CN', { hour12: false })}</dd></>}
          </dl>
        </div>
      ))}
    </div>
  );
}
