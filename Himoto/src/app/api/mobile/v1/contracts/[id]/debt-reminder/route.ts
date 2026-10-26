import { NextRequest } from 'next/server';
import { ContractPaymentError } from '@/lib/server/contract-payments';
import { DebtReminderError, readDebtReminderContext } from '@/lib/server/debt-reminders';
import { himotoPool } from '@/lib/server/himoto-database';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';
import { MobileListError, mobileRecordId } from '@/lib/server/mobile/mobile-lists';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

export const GET = withMobileRequest<Context>('contracts.read', async (_request: NextRequest, context) => {
  let client;
  try {
    const id = mobileRecordId((await context.params).id);
    client = await himotoPool.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await readDebtReminderContext(client, id);
    await client.query('COMMIT');
    return mobileData(result);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof MobileListError) return mobileError('INVALID_INPUT', error.message, 400);
    if (error instanceof DebtReminderError || error instanceof ContractPaymentError) return mobileError(error.status === 404 ? 'NOT_FOUND' : error.status === 409 ? 'CONFLICT' : 'INVALID_INPUT', error.message, error.status);
    return mobileError('UNAVAILABLE', 'Không tải được thông tin nhắc nợ.', 503);
  } finally { client?.release(); }
});
