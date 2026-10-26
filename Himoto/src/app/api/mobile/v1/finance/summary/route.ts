import { NextRequest } from 'next/server';
import { cashbookRentalTotals, type CashbookBreakdown } from '@/lib/management/cashbook';
import { listCashbook } from '@/lib/server/cashbook-list';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { mobileData } from '@/lib/server/mobile/mobile-response';

export const runtime = 'nodejs';

function todayInVietnam() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export const GET = withMobileRequest<{ params: Promise<Record<string, string>> }>(
  'finance.read',
  async (_request: NextRequest) => {
    const to = todayInVietnam();
    const from = `${to.slice(0, 7)}-01`;
    const query = new URLSearchParams({ from, to });
    const result = await listCashbook(query);
    if (Array.isArray(result)) throw new Error('Cashbook summary unavailable.');
    const breakdown = result.breakdown as CashbookBreakdown;
    const totals = cashbookRentalTotals(breakdown);
    return mobileData({
      period: { from, to },
      revenue: totals.revenue,
      income: totals.income,
      expense: totals.expense,
      incomeCount: result.income.total,
      expenseCount: result.expense.total,
    });
  },
  'cashbook_read',
);
