import { NextRequest } from 'next/server';
import { DutyError, deleteDuty, parseDutyInput, saveDuty } from '@/lib/server/duty-roster';
import { himotoPool } from '@/lib/server/himoto-database';
import { MobileBodyError, readMobileJson } from '@/lib/server/mobile/mobile-body';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';
import { mobileDuty } from '@/lib/server/mobile/mobile-duty-roster';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
const dutyFailure = (error: unknown) => error instanceof MobileBodyError
  ? mobileError('INVALID_INPUT', error.message, 400)
  : error instanceof DutyError
    ? mobileError(error.status === 409 ? 'CONFLICT' : error.status === 404 ? 'NOT_FOUND' : 'INVALID_INPUT', error.message, error.status)
    : mobileError('UNAVAILABLE', 'Không thực hiện được yêu cầu lịch trực. Vui lòng thử lại.', 503);
function recordId(value: string) {
  const id = Number(value);
  if (!/^[1-9]\d{0,14}$/.test(value) || !Number.isSafeInteger(id)) throw new DutyError('Mã ca trực không hợp lệ.');
  return id;
}

export const PATCH = withMobileRequest<Context>('hr.write', async (request: NextRequest, context, user) => {
  let client;
  try {
    const { id } = await context.params;
    const input = parseDutyInput(await readMobileJson(request), true);
    if (!user.scope_all && input.store_id !== user.store_id) return mobileError('FORBIDDEN', 'Cơ sở nằm ngoài phạm vi được phân công.', 403);
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const result = await saveDuty(client, user.id, input, recordId(id));
    await client.query('COMMIT');
    return mobileData(mobileDuty(result));
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return dutyFailure(error);
  } finally { client?.release(); }
}, 'duty_roster_write');

export const DELETE = withMobileRequest<Context>('hr.write', async (request: NextRequest, context, user) => {
  let client;
  try {
    const { id } = await context.params;
    const body = await readMobileJson(request, 1024);
    if (Object.keys(body).length !== 1 || typeof body.revision !== 'string') throw new DutyError('Phiên bản ca trực không hợp lệ.');
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const result = await deleteDuty(client, recordId(id), body.revision, user.id);
    await client.query('COMMIT');
    return mobileData(result);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return dutyFailure(error);
  } finally { client?.release(); }
}, 'duty_roster_write');
