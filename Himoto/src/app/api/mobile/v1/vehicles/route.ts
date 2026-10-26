import { NextRequest } from 'next/server';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';
import { ManagementTableError, MobileListError, readMobileList } from '@/lib/server/mobile/mobile-lists';
import { MobileBodyError, readMobileJson } from '@/lib/server/mobile/mobile-body';
import { VehicleSaveError, createDatabaseVehicle, parseVehicleValues } from '@/lib/server/vehicle-management';
import { himotoPool } from '@/lib/server/himoto-database';

export const runtime = 'nodejs';

export const GET = withMobileRequest<{ params: Promise<Record<string, string>> }>('vehicles.read', async (request: NextRequest) => {
  try { return mobileData(await readMobileList('vehicles', request.nextUrl.searchParams)); }
  catch (error) {
    if (error instanceof MobileListError || error instanceof ManagementTableError) return mobileError('INVALID_INPUT', error.message, 400);
    return mobileError('UNAVAILABLE', 'Không tải được danh sách xe.', 503);
  }
}, 'fleet_read');

const vehicleFields = new Set(['name','license','brand','type','year','store_id','status','color','chassis','engine','odometer','note']);

function mobileVehicleError(error: unknown) {
  if (error instanceof MobileBodyError) return mobileError('INVALID_INPUT', error.message, 400);
  if (error instanceof VehicleSaveError) return mobileError(error.status === 409 ? 'CONFLICT' : error.status === 404 ? 'NOT_FOUND' : 'INVALID_INPUT', error.message, error.status);
  if (error && typeof error === 'object' && 'code' in error && error.code === '23505') return mobileError('CONFLICT', 'Biển số này đã có trong danh sách xe.', 409);
  if (error && typeof error === 'object' && 'code' in error && error.code === '55P03') return mobileError('CONFLICT', 'Danh sách xe đang được cập nhật. Vui lòng thử lại.', 409);
  return mobileError('UNAVAILABLE', 'Không lưu được xe. Vui lòng thử lại.', 503);
}

function parseMobileVehicle(body: Record<string, unknown>) {
  if (Object.keys(body).some(key => !vehicleFields.has(key))) throw new MobileBodyError('Thông tin xe chứa trường không được hỗ trợ.');
  return parseVehicleValues(body);
}

export const POST = withMobileRequest<{ params: Promise<Record<string, string>> }>('vehicles.write', async (request, _context, user) => {
  let client;
  try {
    const body = await readMobileJson(request, 16 * 1024);
    const values = parseMobileVehicle(body);
    if (user.access_role !== 'admin' && !user.scope_all && values.store_id !== user.store_id) return mobileError('FORBIDDEN', 'Cơ sở nằm ngoài phạm vi được phân công.', 403);
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const result = await createDatabaseVehicle(client, values, user.id);
    await client.query('COMMIT');
    return mobileData(result, 201);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return mobileVehicleError(error);
  } finally { client?.release(); }
}, 'mobile_vehicle_write');
