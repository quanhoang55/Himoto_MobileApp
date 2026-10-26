import { NextRequest } from 'next/server';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';
import { ManagementTableError, MobileListError, readMobileList } from '@/lib/server/mobile/mobile-lists';

export const runtime = 'nodejs';

export const GET = withMobileRequest<{ params: Promise<Record<string, string>> }>('hr.read', async (request: NextRequest) => {
  try { return mobileData(await readMobileList('staff', request.nextUrl.searchParams)); }
  catch (error) {
    if (error instanceof MobileListError || error instanceof ManagementTableError) return mobileError('INVALID_INPUT', error.message, 400);
    return mobileError('UNAVAILABLE', 'Không tải được danh sách nhân sự.', 503);
  }
});
