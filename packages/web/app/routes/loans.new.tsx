import { Form, Link, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { apiFetch, requireUser } from '../api';
import { PageHead } from '../components';

export async function loader({ request }: LoaderFunctionArgs) {
  const { user, token } = await requireUser(request);
  if (user.role !== 'customer') throw redirect('/');
  const { products } = await apiFetch<{ products: any[] }>('/api/products', { token });
  return json({ products });
}

export async function action({ request }: ActionFunctionArgs) {
  const { token } = await requireUser(request);
  const f = await request.formData();
  try {
    const res = await apiFetch<{ loan: { id: number } }>('/api/loans', {
      token, method: 'POST',
      body: {
        productId: Number(f.get('productId')),
        destinationCountry: String(f.get('destinationCountry')),
        testPurpose: String(f.get('testPurpose')),
        testPurposeDetail: String(f.get('testPurposeDetail') ?? ''),
        expectedReturnDate: String(f.get('expectedReturnDate')),
      },
    });
    return redirect(`/loans/${res.loan.id}`);
  } catch (e: any) {
    return json({ error: e.message }, { status: 400 });
  }
}

const COUNTRIES = ['德国', '日本', '韩国', '泰国', '越南', '马来西亚', '新加坡', '印度尼西亚', '印度', '美国', '墨西哥', '巴西', '阿联酋', '土耳其', '其他'];

export default function NewLoan() {
  const { products } = useLoaderData<typeof loader>();
  const err = useActionData<typeof action>();
  const nav = useNavigation();
  const minDate = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

  return (
    <>
      <PageHead title="申请借用样机" sub="请如实填写目的国家、测试内容与预计寄回时间，跨境申请需经销售审核与法务合规确认" />
      <div className="card" style={{ maxWidth: 760 }}>
        {err?.error && <div className="form-error">{err.error}</div>}
        <Form method="post">
          <label className="field">
            <span className="lbl">选择样机 *</span>
            <select name="productId" required defaultValue="">
              <option value="" disabled>请选择需要借用的样机</option>
              {products.map((p) => (
                <option key={p.id} value={p.id} disabled={p.availableCount === 0}>
                  {p.model} · {p.name}（押金 ¥{p.depositAmount}，在库 {p.availableCount} 台）
                </option>
              ))}
            </select>
            <span className="hint">仅显示可借用样机型号；押金为标准押金，审核时由销售确认</span>
          </label>

          <label className="field">
            <span className="lbl">样机使用国家 / 地区 *</span>
            <input name="destinationCountry" list="countries" required placeholder="例如：德国" />
            <datalist id="countries">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
            <span className="hint">跨境用途将进入出口管制与禁运合规审查，请勿转运至第三国</span>
          </label>

          <label className="field">
            <span className="lbl">测试用途 *</span>
            <input name="testPurpose" required maxLength={100} placeholder="一句话说明做什么测试，如：汽车产线缺陷检测 POC" />
          </label>

          <label className="field">
            <span className="lbl">测试计划详情</span>
            <textarea name="testPurposeDetail" rows={4}
              placeholder="测试场景、周期、环境、参与方等，帮助销售与法务快速审批" />
          </label>

          <label className="field">
            <span className="lbl">预计寄回日期 *</span>
            <input type="date" name="expectedReturnDate" required min={minDate} />
            <span className="hint">请预留足够测试时间；逾期未归还将影响后续借用资格</span>
          </label>

          <div className="btn-row">
            <button className="btn" disabled={nav.state === 'submitting'}>
              {nav.state === 'submitting' ? '提交中…' : '提交申请'}
            </button>
            <Link className="btn secondary" to="/loans">取消</Link>
          </div>
        </Form>
      </div>
    </>
  );
}
