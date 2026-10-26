import { NextRequest } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { ContractHistoryError, readContractHistory } from '@/lib/server/contract-history';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';
import { MobileListError, mobileRecordId } from '@/lib/server/mobile/mobile-lists';

export const runtime = 'nodejs';

export const GET = withMobileRequest<{ params: Promise<{ id: string }> }>('contracts.read', async (_request: NextRequest, context) => {
  let client;
  try {
    const id = mobileRecordId((await context.params).id);
    client = await himotoPool.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='20s'");
    const history = await readContractHistory(client, id);
    await client.query('COMMIT');
    return mobileData({
      changes: history.changes.map(({ id, kind, at, actor, title, detail, amount }) => ({ id, kind, at, actor, title, detail, amount })),
      cashflow: history.cashflow.map(({ id, at, type, reason, note, amount, method, actor, status }) => ({ id, at, type, reason, note, amount, method, actor, status })),
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof MobileListError) return mobileError('INVALID_INPUT', error.message, 400);
    if (error instanceof ContractHistoryError && error.status === 404) return mobileError('NOT_FOUND', error.message, 404);
    return mobileError('UNAVAILABLE', 'Không tải được lịch sử hợp đồng.', 503);
  } finally { client?.release(); }
});
