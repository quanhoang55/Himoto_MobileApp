import { NextRequest } from 'next/server';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';
import { MobileListError, mobileRecordId, readMobileDetail } from '@/lib/server/mobile/mobile-lists';
import { MobileBodyError, readMobileJson } from '@/lib/server/mobile/mobile-body';
import { VehicleSaveError, parseVehicleValues, updateDatabaseVehicle } from '@/lib/server/vehicle-management';
import { himotoPool } from '@/lib/server/himoto-database';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

export const GET = withMobileRequest<{ params: Promise<{ id: string }> }>('vehicles.read', async (_request: NextRequest, context) => {
  try {
    const id = mobileRecordId((await context.params).id);
    const item = await readMobileDetail('vehicles', id);
    return item ? mobileData(item) : mobileError('NOT_FOUND', 'Không tìm thấy xe.', 404);
  } catch (error) {
    if (error instanceof MobileListError) return mobileError('INVALID_INPUT', error.message, 400);
    return mobileError('UNAVAILABLE', 'Không tải được xe.', 503);
  }
}, 'fleet_read');

const vehicleFields = new Set(['name','license','brand','type','year','store_id','status','color','chassis','engine','odometer','note','revision']);

function mobileVehicleError(error: unknown) {
  if (error instanceof MobileBodyError) return mobileError('INVALID_INPUT', error.message, 400);
  if (error instanceof VehicleSaveError) return mobileError(error.status === 409 ? 'CONFLICT' : error.status === 404 ? 'NOT_FOUND' : 'INVALID_INPUT', error.message, error.status);
  if (error && typeof error === 'object' && 'code' in error && error.code === '23505') return mobileError('CONFLICT', 'Biển số này đã có trong danh sách xe.', 409);
  if (error && typeof error === 'object' && 'code' in error && error.code === '55P03') return mobileError('CONFLICT', 'Danh sách xe đang được cập nhật. Vui lòng thử lại.', 409);
  return mobileError('UNAVAILABLE', 'Không lưu được thay đổi xe. Vui lòng thử lại.', 503);
}

export const PATCH = withMobileRequest<Context>('vehicles.write', async (request: NextRequest, context, user) => {
  let client;
  try {
    const id = mobileRecordId((await context.params).id);
    const body = await readMobileJson(request, 16 * 1024);
    if (Object.keys(body).some(key => !vehicleFields.has(key)) || typeof body.revision !== 'string' || !/^\d{1,20}$/.test(body.revision)) throw new MobileBodyError('Tải lại thông tin xe trước khi cập nhật.');
    const values = parseVehicleValues(body);
    if (user.access_role !== 'admin' && !user.scope_all && values.store_id !== user.store_id) return mobileError('FORBIDDEN', 'Cơ sở nằm ngoài phạm vi được phân công.', 403);
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const result = await updateDatabaseVehicle(client, id, values, user.id);
    await client.query('COMMIT');
    return mobileData(result);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return mobileVehicleError(error);
  } finally { client?.release(); }
}, 'mobile_vehicle_write');
