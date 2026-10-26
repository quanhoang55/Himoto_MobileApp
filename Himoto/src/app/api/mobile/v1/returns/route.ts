import { NextRequest } from 'next/server';
import { ContractPaymentError } from '@/lib/server/contract-payments';
import { ContractReturnError, loadContractReturnableItems, parseReturnBatch, searchReturnableItems } from '@/lib/server/contract-returns';
import { completeReturnBatch, parseReturnSettlements } from '@/lib/server/return-settlements';
import { himotoPool } from '@/lib/server/himoto-database';
import { mobileError, mobileData } from '@/lib/server/mobile/mobile-response';
import { MobileBodyError, readMobileJson } from '@/lib/server/mobile/mobile-body';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';

export const runtime = 'nodejs';

export const GET = withMobileRequest('contracts.return', async (request: NextRequest) => {
  let client;
  try {
    const orderIdValue = request.nextUrl.searchParams.get('order_id');
    const query = request.nextUrl.searchParams.get('query') || '';
    if (orderIdValue && !/^[1-9]\d{0,14}$/.test(orderIdValue)) return mobileError('INVALID_INPUT', 'Mã hợp đồng không hợp lệ.', 400);
    client = await himotoPool.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const data = orderIdValue
      ? await loadContractReturnableItems(client, Number(orderIdValue))
      : await searchReturnableItems(client, query);
    await client.query('COMMIT');
    return mobileData(data);
  } catch {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return mobileError('UNAVAILABLE', 'Không tải được danh sách xe cần trả.', 503);
  } finally { client?.release(); }
});

export const POST = withMobileRequest('contracts.return', async (request: NextRequest, _context, user) => {
  let client;
  try {
    const body = await readMobileJson(request, 64 * 1024);
    const inputs = parseReturnBatch(body);
    const settlements = parseReturnSettlements(body && typeof body === 'object' && 'settlements' in body ? (body as { settlements?: unknown }).settlements : undefined);
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const results = await completeReturnBatch(client, user.id, inputs, settlements);
    await client.query('COMMIT');
    return mobileData(results.length === 1 && !(body && typeof body === 'object' && 'items' in body) ? results[0] : results);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof MobileBodyError) return mobileError('INVALID_INPUT', error.message, 400);
    if (error instanceof ContractReturnError || error instanceof ContractPaymentError) {
      return mobileError(error.status === 404 ? 'NOT_FOUND' : error.status === 409 ? 'CONFLICT' : 'INVALID_INPUT', error.message, error.status);
    }
    return mobileError('UNAVAILABLE', 'Chưa ghi nhận được lần trả xe. Kiểm tra trạng thái xe trước khi thử lại.', 503);
  } finally { client?.release(); }
}, 'mobile_contract_return_write');
