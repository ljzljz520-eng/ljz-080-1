export function InspectionPanel({ loan }: { loan: any }) {
  const i = loan.inspection;
  if (!i) return null;
  const color = i.result === 'pass' ? 'green' : i.result === 'damage' ? 'red' : 'gray';
  return (
    <div className="card">
      <div className="card-title">
        🔍 归还检验
        <span className={'badge ' + color} style={{ marginLeft: 'auto' }}>{i.resultLabel}</span>
      </div>
      <dl className="kv">
        <dt>检验说明</dt><dd>{i.conditionNote || '—'}</dd>
        <dt>建议扣款</dt><dd>¥{Number(i.deduction || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</dd>
        <dt>检验人</dt><dd>{i.checkerName ?? '—'}</dd>
        <dt>检验时间</dt><dd>{i.checkedAt ? new Date(i.checkedAt).toLocaleString('zh-CN', { hour12: false }) : '—'}</dd>
      </dl>
    </div>
  );
}
