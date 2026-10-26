import { NextRequest } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';

export const runtime = 'nodejs';

export const GET = withMobileRequest('vehicles.read', async (_request: NextRequest, _context, user) => {
  let client;
  try {
    client = await himotoPool.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='20s'");
    const storeId = user.scope_all ? null : user.store_id;
    const devices = await client.query(`SELECT d.id,d.vehicle_id,d.provider,d.external_device_id,d.provider_device_name,d.mapping_status,
      CASE WHEN d.provider_status='not_visible_in_account' THEN 'unavailable' ELSE d.management_status END AS management_status,
      CASE WHEN d.provider_status='not_visible_in_account' THEN d.sync_received_at ELSE COALESCE(a.last_success_at,d.sync_received_at) END AS sync_received_at,
      d.heartbeat_at,d.last_latitude,d.last_longitude,d.last_speed,d.provider_reported_at,d.position_recorded_at,d.last_ignition,
      v.license,COALESCE(v.current_store_id,v.store_id) AS store_id,s.store_name
      FROM himoto.gps_devices d LEFT JOIN himoto.management_gps_accounts a ON a.id=d.source_account_id
      LEFT JOIN himoto.vehicles v ON v.id=d.vehicle_id LEFT JOIN himoto.stores s ON s.id=COALESCE(v.current_store_id,v.store_id)
      WHERE (d.vehicle_id IS NULL OR v.id IS NOT NULL AND v.deleted_at IS NULL)
        AND ($1::bigint IS NULL OR COALESCE(v.current_store_id,v.store_id)=$1)
      ORDER BY COALESCE(a.last_success_at,d.sync_received_at) DESC NULLS LAST,d.id DESC`, [storeId]);
    const missing = await client.query(`SELECT -v.id AS id,v.id AS vehicle_id,NULL::text AS provider,'' AS external_device_id,
      '' AS provider_device_name,'unmapped' AS mapping_status,'none' AS management_status,NULL AS sync_received_at,
      NULL AS heartbeat_at,NULL AS last_latitude,NULL AS last_longitude,NULL AS last_speed,NULL AS provider_reported_at,
      NULL AS position_recorded_at,NULL AS last_ignition,v.license,COALESCE(v.current_store_id,v.store_id) AS store_id,s.store_name
      FROM himoto.vehicles v LEFT JOIN himoto.stores s ON s.id=COALESCE(v.current_store_id,v.store_id)
      WHERE v.deleted_at IS NULL AND ($1::bigint IS NULL OR COALESCE(v.current_store_id,v.store_id)=$1)
        AND NOT EXISTS(SELECT 1 FROM himoto.gps_devices d WHERE d.vehicle_id=v.id) ORDER BY v.id`, [storeId]);
    await client.query('COMMIT');
    const rows = [...devices.rows, ...missing.rows].map(row => ({
      id:Number(row.id), vehicleId:row.vehicle_id===null?null:Number(row.vehicle_id), provider:row.provider,
      externalDeviceId:row.external_device_id, deviceName:row.provider_device_name, mappingStatus:row.mapping_status,
      state:row.management_status || 'warning', syncedAt:row.sync_received_at, heartbeatAt:row.heartbeat_at,
      latitude:row.last_latitude===null?null:Number(row.last_latitude), longitude:row.last_longitude===null?null:Number(row.last_longitude),
      speed:row.last_speed===null?null:Number(row.last_speed), reportedAt:row.provider_reported_at, positionAt:row.position_recorded_at,
      ignition:row.last_ignition, license:row.license, storeId:row.store_id===null?null:Number(row.store_id), storeName:row.store_name,
    }));
    return mobileData({ devices:rows });
  } catch {
    if(client) await client.query('ROLLBACK').catch(()=>{});
    return mobileError('UNAVAILABLE','Không tải được trạng thái GPS.',503);
  } finally { client?.release(); }
});
