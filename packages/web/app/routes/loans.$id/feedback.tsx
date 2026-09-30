export function FeedbackPanel({ loan }: { loan: any }) {
  const f = loan.feedback;
  if (!f) {
    return (
      <div className="card">
        <div className="card-title">🧪 试用反馈</div>
        <div className="muted">客户尚未提交试用反馈。</div>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="card-title">🧪 试用反馈 <span style={{ marginLeft: 'auto' }} className="muted">{'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}</span></div>
      <dl className="kv">
        <dt>使用情况</dt><dd>{f.usage_summary}</dd>
        {f.issues && <><dt>问题记录</dt><dd>{f.issues}</dd></>}
        {f.result && <><dt>测试结论</dt><dd>{f.result}</dd></>}
        <dt>提交时间</dt><dd>{new Date(f.submitted_at).toLocaleString('zh-CN', { hour12: false })}</dd>
      </dl>
    </div>
  );
}
