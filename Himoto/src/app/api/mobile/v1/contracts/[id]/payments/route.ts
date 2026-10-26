import { NextRequest } from 'next/server';
import { ContractPaymentError, parseContractPayment, readPaymentContext, recordContractPayment } from '@/lib/server/contract-payments';
import { himotoPool } from '@/lib/server/himoto-database';
import { MobileBodyError, readMobileJson } from '@/lib/server/mobile/mobile-body';
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
    await client.query("SET LOCAL statement_timeout='20s'");
    const data = await readPaymentContext(client, id);
    await client.query('COMMIT');
    return mobileData(data);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof MobileListError) return mobileError('INVALID_INPUT', error.message, 400);
    if (error instanceof ContractPaymentError) return mobileError(error.status === 404 ? 'NOT_FOUND' : error.status === 409 ? 'CONFLICT' : 'INVALID_INPUT', error.message, error.status);
    return mobileError('UNAVAILABLE', 'Không tải được thông tin thu chi hợp đồng.', 503);
  } finally { client?.release(); }
});

export const POST = withMobileRequest<Context>('finance.write', async (request: NextRequest, context, user) => {
  let client;
  try {
    const id = mobileRecordId((await context.params).id);
    const body = await readMobileJson(request, 8 * 1024);
    const input = parseContractPayment(body);
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const result = await recordContractPayment(client, id, user.id, input);
    await client.query('COMMIT');
    return mobileData(result);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof MobileBodyError || error instanceof MobileListError) return mobileError('INVALID_INPUT', error.message, 400);
    if (error instanceof ContractPaymentError) return mobileError(error.status === 404 ? 'NOT_FOUND' : error.status === 409 ? 'CONFLICT' : 'INVALID_INPUT', error.message, error.status);
    return mobileError('UNAVAILABLE', 'Chưa ghi nhận được giao dịch. Kiểm tra lịch sử trước khi thử lại.', 503);
  } finally { client?.release(); }
}, 'mobile_contract_payment_write');
