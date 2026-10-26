import { NextRequest } from 'next/server';
import { ContractPaymentError } from '@/lib/server/contract-payments';
import { ContractRenewalError, parseRenewalInput } from '@/lib/server/contract-renewals';
import { renewContractAndCollect } from '@/lib/server/contract-renewal-collection';
import { queueContractNotification } from '@/lib/server/contract-notifications';
import { contractVehicleReadSource } from '@/lib/server/contract-vehicle-reads';
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
    const result = await client.query(`SELECT d.id,d.vehicle_id,v.name,v.license,d.rent_at,d.return_at,d.completed_at,d.total_renewal_amount,d.xmin::text AS revision
      FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
      LEFT JOIN ${contractVehicleReadSource()} v ON v.id=d.vehicle_id
      WHERE d.order_id=$1 AND d.deleted_at IS NULL AND o.deleted_at IS NULL ORDER BY d.id`, [id]);
    await client.query('COMMIT');
    return mobileData({ items: result.rows.map(row => ({ id: Number(row.id), vehicleId: Number(row.vehicle_id), name: String(row.name || ''),
      license: String(row.license || ''), rentAt: row.rent_at instanceof Date ? row.rent_at.toISOString() : row.rent_at == null ? null : String(row.rent_at),
      returnAt: row.return_at instanceof Date ? row.return_at.toISOString() : row.return_at == null ? null : String(row.return_at),
      completedAt: row.completed_at instanceof Date ? row.completed_at.toISOString() : row.completed_at == null ? null : String(row.completed_at),
      renewalAmount: row.total_renewal_amount == null ? 0 : Number(row.total_renewal_amount), revision: String(row.revision) })) });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof MobileListError) return mobileError('INVALID_INPUT', error.message, 400);
    return mobileError('UNAVAILABLE', 'Không tải được lịch sử xe của hợp đồng.', 503);
  } finally { client?.release(); }
});

export const POST = withMobileRequest<Context>('contracts.renew', async (request: NextRequest, context, user) => {
  let client;
  try {
    const id = mobileRecordId((await context.params).id);
    const body = await readMobileJson(request, 12 * 1024);
    const input = parseRenewalInput(body);
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const result = await renewContractAndCollect(client, id, user.id, input);
    if (!result.replayed) {
      const versions = (await client.query('SELECT draft_payload FROM himoto.orders WHERE id=$1', [id])).rows[0]?.draft_payload?.management_composer?.versions;
      const version = Array.isArray(versions) ? versions.find((item: { version?: number }) => item.version === result.version) : undefined;
      await queueContractNotification(client, id, 'renewal', `renewal:${id}:${result.version}`, user.id, `renewal-${result.version}`, version);
    }
    await client.query('COMMIT');
    return mobileData(result);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof MobileBodyError || error instanceof MobileListError) return mobileError('INVALID_INPUT', error.message, 400);
    if (error instanceof ContractRenewalError || error instanceof ContractPaymentError) return mobileError(error.status === 404 ? 'NOT_FOUND' : error.status === 409 ? 'CONFLICT' : 'INVALID_INPUT', error.message, error.status);
    if (error instanceof SyntaxError) return mobileError('INVALID_INPUT', 'Thông tin gia hạn không hợp lệ.', 400);
    return mobileError('UNAVAILABLE', 'Không lưu được gia hạn hợp đồng.', 503);
  } finally { client?.release(); }
}, 'mobile_contract_renewal_write');
