import { createDemoDataset } from './management-data';
import { CashbookRow } from '@/lib/management/cashbook';

/** Static illustrative vouchers, independent of rental actions or cash balances. */
export function createCashbookFixtures(): CashbookRow[] {
  const { staff } = createDemoDataset();
  const incomeReasons = ['Thu phí dịch vụ', 'Thu tiền thuê xe', 'Thu hoàn ứng', 'Thu khoản bổ sung'];
  const expenseReasons = ['Chi bảo dưỡng xe', 'Chi mua vật tư', 'Chi vận hành cơ sở', 'Chi hoàn ứng'];
  return Array.from({ length: 48 }, (_, index) => {
    const income = index % 2 === 0;
    const pair = Math.floor(index / 2);
    const actor = staff[pair % staff.length];
    const reason = (income ? incomeReasons : expenseReasons)[pair % 4];
    return { id: `${income ? 'PT' : 'PC'}-2610-${String(pair + 1).padStart(3, '0')}`,
      date: `2026-10-${String(pair % 6 + 1).padStart(2, '0')}`,
      time: `${String(8 + pair % 9).padStart(2, '0')}:${String(index % 4 * 15).padStart(2, '0')}:00`,
      type: income ? 'income' : 'expense', actor_id: String(actor.id), actor_name: actor.name,
      reason, content: `${income ? 'Ghi nhận khoản thu' : 'Ghi nhận khoản chi'} mẫu số ${pair + 1}: ${reason.toLowerCase()} tại ${actor.store_name}.`,
      store_id: String(actor.store_id) };
  });
}
