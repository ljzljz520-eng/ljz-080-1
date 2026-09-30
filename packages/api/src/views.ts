import type { Role } from './types.js';

/**
 * 按角色裁剪字段：
 * - legal：     只看合同与合规内容（隐藏押金、物流、质检备注等）
 * - warehouse： 只处理发货与收货（隐藏合同条款、押金金额、试用反馈内容）
 */
export function roleScope(role: Role, selectPrefix = 'a') {
  if (role === 'legal') {
    return `${selectPrefix}.id, ${selectPrefix}.code, ${selectPrefix}.product_id,
      ${selectPrefix}.customer_id, ${selectPrefix}.destination_country,
      ${selectPrefix}.test_purpose, ${selectPrefix}.return_date,
      ${selectPrefix}.quantity, ${selectPrefix}.status,
      ${selectPrefix}.sales_comment,
      ${selectPrefix}.legal_reviewed_at, ${selectPrefix}.compliance_passed,
      ${selectPrefix}.contract_no, ${selectPrefix}.contract_terms,
      ${selectPrefix}.export_classification, ${selectPrefix}.compliance_notes,
      ${selectPrefix}.created_at, ${selectPrefix}.updated_at`;
  }
  if (role === 'warehouse') {
    return `${selectPrefix}.id, ${selectPrefix}.code, ${selectPrefix}.customer_id,
      ${selectPrefix}.product_id, ${selectPrefix}.quantity, ${selectPrefix}.status,
      ${selectPrefix}.destination_country, ${selectPrefix}.return_date,
      ${selectPrefix}.deposit_status,
      ${selectPrefix}.outbound_tracking_no, ${selectPrefix}.outbound_carrier,
      ${selectPrefix}.shipped_at, ${selectPrefix}.delivered_at,
      ${selectPrefix}.inbound_tracking_no, ${selectPrefix}.inbound_carrier,
      ${selectPrefix}.return_received_at,
      ${selectPrefix}.inspection_result, ${selectPrefix}.inspection_notes,
      ${selectPrefix}.inspected_at,
      ${selectPrefix}.created_at, ${selectPrefix}.updated_at`;
  }
  return `${selectPrefix}.*`;
}

// 仓库视角需要判断"押金已到账才能发货"，只暴露布尔化的押金状态，不含金额
export function canSeeFeedback(role: Role) {
  return role === 'customer' || role === 'sales';
}
