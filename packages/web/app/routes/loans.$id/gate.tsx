export function GateChecklist({ loan }: { loan: any }) {
  const g = loan.gate;
  const items: { ok: boolean; label: string }[] = [
    { ok: g.unitAssigned, label: '样机已分配（指定序列号）' },
    { ok: g.depositPaid, label: '押金已到账' },
    { ok: g.contractSigned, label: '借用合同已签署' },
    { ok: g.complianceCleared, label: '法务合规通过' },
  ];
  return (
    <>
      <ul className="checklist">
        {items.map((it) => (
          <li key={it.label}>
            <span className={'ic ' + (it.ok ? 'ok' : 'no')}>{it.ok ? '✅' : '⬜'}</span>
            <span style={{ textDecoration: it.ok ? 'none' : undefined }}>{it.label}</span>
          </li>
        ))}
      </ul>
      <div className="section-tip" style={{ marginTop: 12, marginBottom: 0 }}>
        {g.ready
          ? '全部满足：单据自动进入「待仓库发货」，仓库即可出库。'
          : '以上条件全部满足后才会进入仓库发货队列（系统自动判定）。'}
      </div>
    </>
  );
}
