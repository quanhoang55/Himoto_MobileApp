import { NextRequest } from 'next/server';
import { isManagementConfigured } from '@/lib/server/management-session';
import { MobileBodyError, readMobileJson } from '@/lib/server/mobile/mobile-body';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';
import { MobileSessionError, rotateMobileSession } from '@/lib/server/mobile/mobile-sessions';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!isManagementConfigured()) return mobileError('UNAVAILABLE', 'Hệ thống chưa được cấu hình.', 503);
  try {
    const body = await readMobileJson(request);
    const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken : undefined;
    const session = await rotateMobileSession(refreshToken);
    return mobileData(session);
  } catch (error) {
    if (error instanceof MobileBodyError) return mobileError('INVALID_INPUT', error.message, 400);
    if (error instanceof MobileSessionError) return mobileError('UNAUTHENTICATED', error.message, error.status);
    return mobileError('UNAVAILABLE', 'Không làm mới được phiên đăng nhập. Vui lòng thử lại.', 503);
  }
}
