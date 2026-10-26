import { NextRequest } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { VehicleHistoryError, readVehicleHistory } from '@/lib/server/vehicle-history';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';
import { MobileListError, mobileRecordId } from '@/lib/server/mobile/mobile-lists';

export const runtime = 'nodejs';

export const GET = withMobileRequest<{ params: Promise<{ id: string }> }>('vehicles.read', async (_request: NextRequest, context) => {
  let client;
  try {
    const id = mobileRecordId((await context.params).id);
    client = await himotoPool.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='20s'");
    const events = await readVehicleHistory(client, id);
    await client.query('COMMIT');
    return mobileData(events.map(({ key, action, label, vehicle_name, license, location, responsible_store, beneficiary_store, at, actor }) => ({
      id: key, action, label, vehicleName: vehicle_name, license, location: location.startsWith('Khách:') ? '' : location,
      responsibleStore: responsible_store, beneficiaryStore: beneficiary_store, at, actor,
    })));
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof MobileListError) return mobileError('INVALID_INPUT', error.message, 400);
    if (error instanceof VehicleHistoryError && error.status === 404) return mobileError('NOT_FOUND', error.message, 404);
    return mobileError('UNAVAILABLE', 'Không tải được lịch sử xe.', 503);
  } finally { client?.release(); }
}, 'fleet_read');
