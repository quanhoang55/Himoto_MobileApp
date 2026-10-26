import 'server-only';
import { NextRequest } from 'next/server';
import { hasPermission, type AccessPermission } from '@/lib/management/permissions';
import { dataAccess } from '../access-context';
import { isManagementConfigured, type SessionUser } from '../management-session';
import { resolveMobileSession } from './mobile-sessions';
import { mobileError } from './mobile-response';

type MobileHandler<C> = (request: NextRequest, context: C, user: SessionUser) => Promise<Response> | Response;

/** Bearer-only boundary. Web cookies are deliberately ignored by mobile routes. */
export function withMobileRequest<C>(permission: AccessPermission | null, handler: MobileHandler<C>, operation = '') {
  return async (request: NextRequest, context: C): Promise<Response> => {
    if (!isManagementConfigured()) return mobileError('UNAVAILABLE', 'Hệ thống chưa được cấu hình.', 503);
    const authorization = request.headers.get('authorization') || '';
    const match = /^Bearer ([^\s]+)$/.exec(authorization);
    if (!match) return mobileError('UNAUTHENTICATED', 'Vui lòng đăng nhập.', 401);
    let user: SessionUser | null;
    try { user = await resolveMobileSession(match[1]); }
    catch { return mobileError('UNAVAILABLE', 'Không xác thực được phiên đăng nhập. Vui lòng thử lại.', 503); }
    if (!user) return mobileError('UNAUTHENTICATED', 'Phiên đăng nhập đã hết hạn.', 401);
    if (permission && !hasPermission(user, permission)) return mobileError('FORBIDDEN', 'Tài khoản không có quyền truy cập.', 403);
    try {
      return await dataAccess.run({ ...user, store_id: user.store_id ?? null, scope_all: user.scope_all === true, operation }, () => handler(request, context, user));
    } catch {
      return mobileError('UNAVAILABLE', 'Không thực hiện được yêu cầu. Vui lòng thử lại.', 503);
    }
  };
}
