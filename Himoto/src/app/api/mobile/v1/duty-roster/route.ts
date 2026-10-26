import { NextRequest } from 'next/server';
import { vietnamDate } from '@/lib/management/duty-roster';
import { DutyError, listDuties, parseDutyInput, saveDuty } from '@/lib/server/duty-roster';
import { himotoPool } from '@/lib/server/himoto-database';
import { MobileBodyError, readMobileJson } from '@/lib/server/mobile/mobile-body';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';
import { mobileDuty } from '@/lib/server/mobile/mobile-duty-roster';

export const runtime = 'nodejs';

const dutyFailure = (error: unknown) => error instanceof MobileBodyError
  ? mobileError('INVALID_INPUT', error.message, 400)
  : error instanceof DutyError
    ? mobileError(error.status === 409 ? 'CONFLICT' : error.status === 404 ? 'NOT_FOUND' : 'INVALID_INPUT', error.message, error.status)
    : mobileError('UNAVAILABLE', 'Không thực hiện được yêu cầu lịch trực. Vui lòng thử lại.', 503);

export const GET = withMobileRequest<{ params: Promise<Record<string, string>> }>('hr.read', async (request: NextRequest) => {
  let client;
  try {
    const week = request.nextUrl.searchParams.get('week') || vietnamDate();
    const storeText = request.nextUrl.searchParams.get('store_id');
    if (request.nextUrl.searchParams.size > 2 || [...request.nextUrl.searchParams.keys()].some(key => !['week', 'store_id'].includes(key))) throw new DutyError('Bộ lọc lịch trực không hợp lệ.');
    if (storeText !== null && !/^[1-9]\d*$/.test(storeText)) throw new DutyError('Cơ sở không hợp lệ.');
    client = await himotoPool.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await listDuties(client, week, storeText === null ? undefined : Number(storeText));
    await client.query('COMMIT');
    return mobileData({ ...result, schedules: result.schedules.map(mobileDuty) });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return dutyFailure(error);
  } finally { client?.release(); }
});

export const POST = withMobileRequest<{ params: Promise<Record<string, string>> }>('hr.write', async (request: NextRequest, _context, user) => {
  let client;
  try {
    const input = parseDutyInput(await readMobileJson(request));
    if (!user.scope_all && input.store_id !== user.store_id) return mobileError('FORBIDDEN', 'Cơ sở nằm ngoài phạm vi được phân công.', 403);
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const result = await saveDuty(client, user.id, input);
    await client.query('COMMIT');
    return mobileData(mobileDuty(result), 201);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return dutyFailure(error);
  } finally { client?.release(); }
}, 'duty_roster_write');
