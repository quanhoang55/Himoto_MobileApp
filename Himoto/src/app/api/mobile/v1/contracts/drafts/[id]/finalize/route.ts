import { NextRequest } from 'next/server';
import { ContractFinalizeError, finalizeContractDraft, parseFinalizeInput } from '@/lib/server/contract-finalize';
import { queueContractNotification } from '@/lib/server/contract-notifications';
import { himotoPool } from '@/lib/server/himoto-database';
import { MobileBodyError, readMobileJson } from '@/lib/server/mobile/mobile-body';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';
import { MobileListError, mobileRecordId } from '@/lib/server/mobile/mobile-lists';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { hasPermission } from '@/lib/management/permissions';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

export const POST = withMobileRequest<Context>('contracts.finalize', async (request: NextRequest, context, user) => {
  if (!hasPermission(user, 'contracts.draft')) return mobileError('FORBIDDEN', 'Tài khoản không có quyền lập hợp đồng nháp.', 403);
  let client;
  let result;
  let id: number;
  try {
    id = mobileRecordId((await context.params).id);
    const body = await readMobileJson(request, 24 * 1024);
    const input = parseFinalizeInput(body);
    client = await himotoPool.connect();
    await client.query('BEGIN');
    result = await finalizeContractDraft(client, id, user.id, input);
    await client.query('COMMIT');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof MobileBodyError || error instanceof MobileListError) return mobileError('INVALID_INPUT', error.message, 400);
    if (error instanceof ContractFinalizeError) return mobileError(error.code === 'reservation_overlap' ? 'CONFLICT' : error.status === 404 ? 'NOT_FOUND' : error.status === 409 ? 'CONFLICT' : 'INVALID_INPUT', error.message, error.status);
    if (error instanceof SyntaxError) return mobileError('INVALID_INPUT', 'Thông tin xác nhận hợp đồng không hợp lệ.', 400);
    return mobileError('UNAVAILABLE', 'Không thể xác nhận hợp đồng. Vui lòng thử lại.', 503);
  } finally { client?.release(); client = undefined; }

  try {
    client = await himotoPool.connect();
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout='60s'");
    await queueContractNotification(client, id!, result.status === 'deposit_contract' ? 'reservation' : 'rental', `finalize:${id}:${result.code}`, user.id, 'rental');
    await client.query('COMMIT');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Mobile contract finalize notification queue failed:', error instanceof Error ? error.message : error);
  } finally { client?.release(); }
  return mobileData(result);
}, 'mobile_contract_finalize');
