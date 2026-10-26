import { NextRequest } from 'next/server';
import { isManagementConfigured } from '@/lib/server/management-session';
import { MobileBodyError, readMobileJson } from '@/lib/server/mobile/mobile-body';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';
import { revokeMobileSession } from '@/lib/server/mobile/mobile-sessions';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!isManagementConfigured()) return mobileError('UNAVAILABLE', 'Hệ thống chưa được cấu hình.', 503);
  try {
    const body = await readMobileJson(request);
    await revokeMobileSession(typeof body.refreshToken === 'string' ? body.refreshToken : undefined);
    return mobileData({ success: true });
  } catch (error) {
    if (error instanceof MobileBodyError) return mobileError('INVALID_INPUT', error.message, 400);
    return mobileError('UNAVAILABLE', 'Không đăng xuất được trên máy chủ. Vui lòng thử lại.', 503);
  }
}
