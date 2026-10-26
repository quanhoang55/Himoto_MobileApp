import { NextRequest } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';

export const runtime = 'nodejs';

export const GET = withMobileRequest<{ params: Promise<Record<string, string>> }>('contracts.read', async (_request: NextRequest) => {
  try {
    const result = await himotoPool.query(`SELECT r.id, to_char(r.report_date, 'YYYY-MM-DD') AS date, r.status, s.store_name
      FROM himoto.management_shift_reports r JOIN himoto.stores s ON s.id=r.store_id
      ORDER BY r.report_date DESC, r.id DESC LIMIT 50`);
    return mobileData({ items: result.rows.map(row => ({
      id: Number(row.id), date: String(row.date || ''),
      status: String(row.status || ''), storeName: String(row.store_name || ''),
    })) });
  } catch { return mobileError('UNAVAILABLE', 'Không tải được báo cáo cuối ca.', 503); }
});
