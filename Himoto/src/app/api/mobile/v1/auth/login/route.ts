import { NextRequest } from 'next/server';
import { authenticateAccount, isManagementConfigured, isLoginEnabled, LoginError } from '@/lib/server/management-session';
import { checkMobileLoginLimit, clearMobileLoginLimit } from '@/lib/server/mobile/mobile-login-limit';
import { MobileBodyError, readMobileJson } from '@/lib/server/mobile/mobile-body';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';
import { issueMobileSession } from '@/lib/server/mobile/mobile-sessions';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!isManagementConfigured()) {
    console.error('[mobile-auth] login unavailable: server database/session configuration is missing');
    return mobileError('UNAVAILABLE', 'Hệ thống chưa được cấu hình.', 503);
  }
  if (!isLoginEnabled()) return mobileError('LOGIN_DISABLED', 'Đăng nhập tạm thời bị tắt theo cấu hình hệ thống.', 403);
  let stage = 'read_request';
  try {
    const body = await readMobileJson(request);
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!/^[a-zA-Z0-9._@+-]{3,254}$/.test(email) || !password || password.length > 256) {
      return mobileError('INVALID_INPUT', 'Kiểm tra tài khoản và mật khẩu đã nhập.', 400);
    }
    stage = 'rate_limit';
    await checkMobileLoginLimit(email);
    stage = 'authenticate_account';
    const user = await authenticateAccount(email, password);
    stage = 'create_session';
    const session = await issueMobileSession(user.id);
    stage = 'clear_rate_limit';
    await clearMobileLoginLimit(email);
    return mobileData({ user, ...session }, 201);
  } catch (error) {
    if (error instanceof MobileBodyError) return mobileError('INVALID_INPUT', error.message, 400);
    if (error instanceof LoginError) return mobileError(error.status === 429 ? 'RATE_LIMITED' : error.status === 403 ? 'FORBIDDEN' : 'INVALID_CREDENTIALS', error.message, error.status);
    const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'unknown';
    const name = error instanceof Error ? error.name : 'unknown';
    console.error('[mobile-auth] login failed', { stage, code, name });
    return mobileError('UNAVAILABLE', 'Kết nối đăng nhập đang gián đoạn. Vui lòng thử lại.', 503);
  }
}
