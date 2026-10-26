import { NextRequest } from 'next/server';
import { TransferHistoryError, readTransferHistory } from '@/lib/server/vehicle-transfer-history';
import { himotoPool } from '@/lib/server/himoto-database';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';

export const runtime = 'nodejs';

export const GET = withMobileRequest('vehicles.read', async (request: NextRequest, _context, user) => {
  try {
    const params = new URLSearchParams(request.nextUrl.searchParams);
    if (user.access_role === 'admin' || user.scope_all) {
      if (!params.has('store')) params.set('store', 'all');
    } else {
      if (!user.store_id) return mobileError('FORBIDDEN', 'Tài khoản chưa được gán cơ sở.', 403);
      params.set('store', String(user.store_id));
    }
    return mobileData(await readTransferHistory(himotoPool, params));
  } catch (error) {
    if (error instanceof TransferHistoryError) return mobileError('INVALID_INPUT', error.message, 400);
    return mobileError('UNAVAILABLE', 'Không tải được lịch sử luân chuyển.', 503);
  }
});
