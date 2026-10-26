import { NextRequest } from 'next/server';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';
import { MobileListError, mobileRecordId, readMobileDetail } from '@/lib/server/mobile/mobile-lists';

export const runtime = 'nodejs';

export const GET = withMobileRequest<{ params: Promise<{ id: string }> }>('contracts.read', async (_request: NextRequest, context) => {
  try {
    const id = mobileRecordId((await context.params).id);
    const item = await readMobileDetail('contracts', id);
    return item ? mobileData(item) : mobileError('NOT_FOUND', 'Không tìm thấy hợp đồng.', 404);
  } catch (error) {
    if (error instanceof MobileListError) return mobileError('INVALID_INPUT', error.message, 400);
    return mobileError('UNAVAILABLE', 'Không tải được hợp đồng.', 503);
  }
});
