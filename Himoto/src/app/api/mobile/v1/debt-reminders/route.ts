import { NextRequest } from 'next/server';
import { ContractPaymentError } from '@/lib/server/contract-payments';
import { DebtReminderError, listDebtReminders, sendDebtReminder } from '@/lib/server/debt-reminders';
import { himotoPool } from '@/lib/server/himoto-database';
import { MobileBodyError, readMobileJson } from '@/lib/server/mobile/mobile-body';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { canSendDebtReminder } from '@/lib/management/permissions';

export const runtime = 'nodejs';
export const maxDuration = 30;

export const GET = withMobileRequest('contracts.read', async (request: NextRequest, _context, user) => {
  try {
    const pageText = request.nextUrl.searchParams.get('page') || '1';
    if (!/^[1-9]\d*$/.test(pageText)) return mobileError('INVALID_INPUT', 'Trang không hợp lệ.', 400);
    if (!user.scope_all && !user.store_id) return mobileError('FORBIDDEN', 'Tài khoản chưa được gán cơ sở.', 403);
    const store = user.scope_all ? 'all' : String(user.store_id);
    return mobileData(await listDebtReminders(himotoPool, store, Number(pageText)));
  } catch (error) {
    if (error instanceof DebtReminderError) return mobileError('INVALID_INPUT', error.message, error.status);
    return mobileError('UNAVAILABLE', 'Không tải được lịch sử nhắc nợ.', 503);
  }
});

export const POST = withMobileRequest('contracts.read', async (request: NextRequest, _context, user) => {
  if (!canSendDebtReminder(user)) return mobileError('FORBIDDEN', 'Tài khoản chưa có quyền gửi nhắc nợ.', 403);
  try {
    const body = await readMobileJson(request, 24 * 1024);
    return mobileData(await sendDebtReminder(himotoPool, user.id, body));
  } catch (error) {
    if (error instanceof MobileBodyError) return mobileError('INVALID_INPUT', error.message, 400);
    if (error instanceof DebtReminderError || error instanceof ContractPaymentError) return mobileError(error.status === 403 ? 'FORBIDDEN' : error.status === 404 ? 'NOT_FOUND' : error.status === 409 ? 'CONFLICT' : error.status === 429 ? 'RATE_LIMITED' : 'INVALID_INPUT', error.message, error.status);
    return mobileError('UNAVAILABLE', 'Không xử lý được yêu cầu nhắc nợ. Kiểm tra lịch sử trước khi gửi lại.', 503);
  }
});
