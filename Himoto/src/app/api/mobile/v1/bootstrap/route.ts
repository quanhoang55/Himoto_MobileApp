import { NextRequest } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';

export const runtime = 'nodejs';

export const GET = withMobileRequest<{ params: Promise<Record<string, string>> }>(null, async (_request: NextRequest, _context, user) => {
  try {
    const result = await himotoPool.query('SELECT * FROM himoto.store_directory()');
    const stores = result.rows.map(row => ({ id: Number(row.id), name: String(row.store_name || '') }));
    return mobileData({ user, stores });
  } catch { return mobileError('UNAVAILABLE', 'Không tải được thông tin khởi tạo.', 503); }
});
