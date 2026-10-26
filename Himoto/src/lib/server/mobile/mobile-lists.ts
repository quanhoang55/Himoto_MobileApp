import 'server-only';
import type { PoolClient } from 'pg';
import type { ManagementRow } from '@/lib/management/types';
import { himotoPool } from '../himoto-database';
import { ManagementTableError, readManagementTable } from '../management-table';
import { CUSTOMER_PROFILE_SQL } from '../customer-search';

export type MobileListKind = 'contracts' | 'customers' | 'vehicles' | 'staff';
export class MobileListError extends Error {}

const allowedParams = new Set(['page', 'size', 'search', 'store', 'scope', 'status', 'sort', 'direction']);
const string = (value: unknown) => value == null ? '' : String(value);
const numberOrNull = (value: unknown) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const vehicleStatus = (value: unknown) => ({ rent: 'using', maintenance: 'repairing', holding: 'pending' } as Record<string, string>)[string(value)] || string(value);

export function mobileListParams(kind: MobileListKind, source: URLSearchParams) {
  for (const key of source.keys()) if (!allowedParams.has(key) && !(kind === 'contracts' && key === 'filter_id')) throw new MobileListError('Bộ lọc không hợp lệ.');
  if (kind !== 'contracts' && source.has('scope')) throw new MobileListError('Phạm vi không hợp lệ.');
  const params = new URLSearchParams(source);
  if (!params.has('size')) params.set('size', '20');
  if (!params.has('direction')) params.set('direction', 'desc');
  return params;
}

export function mobileListItem(kind: MobileListKind, row: ManagementRow) {
  const shared = { id: row.id, code: row.code, name: row.name, status: row.status,
    storeId: numberOrNull(row.store_id), storeName: string(row.store_name) };
  if (kind === 'contracts') return { ...shared,
    customerId: numberOrNull(row.customer_id), customerName: string(row.customer_name), customerPhone: string(row.customer_phone),
    startDate: string(row.start_date), endDate: string(row.end_date),
    totalAmount: numberOrNull(row.total_amount), paidAmount: numberOrNull(row.paid_amount),
    rentalType: string(row.rental_type), revision: string(row.draft_revision) };
  if (kind === 'customers') return { ...shared,
    phone: string(row.phone), contractCount: numberOrNull(row.contract_count),
    warning: Boolean(row.warning_note) };
  if (kind === 'staff') return { ...shared, position: string(row.position) };
  return { ...shared, license: string(row.license), brand: string(row.brand), type: string(row.type), year: numberOrNull(row.year),
    color: string(row.color), chassis: string(row.chassis), engine: string(row.engine), odometer: numberOrNull(row.odometer),
    currentStoreId: numberOrNull(row.store_id), locationStatus: string(row.location_status),
    gpsLastAt: string(row.gps_last_sync), revision: string(row.vehicle_revision) };
}

type TableReader = (client: Pick<PoolClient, 'query'>, kind: MobileListKind, params: URLSearchParams) => ReturnType<typeof readManagementTable>;
type Connection = Pick<PoolClient, 'query' | 'release'>;

export async function readMobileList(
  kind: MobileListKind,
  source: URLSearchParams,
  connect: () => Promise<Connection> = () => himotoPool.connect(),
  reader: TableReader = readManagementTable,
) {
  const params = mobileListParams(kind, source);
  if (kind === 'vehicles') return readMobileFleet(params, connect);
  let client: Connection | undefined;
  try {
    client = await connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='20s'");
    const result = await reader(client, kind, params);
    await client.query('COMMIT');
    return { items: result.rows.map(row => mobileListItem(kind, row)), page: result.page,
      total: result.total, hasMore: result.page < result.pages };
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client?.release(); }
}

async function readMobileFleet(params: URLSearchParams, connect: () => Promise<Connection>) {
  const pageText = params.get('page') || '1', sizeText = params.get('size') || '20';
  if (!/^[1-9]\d*$/.test(pageText) || !/^[1-9]\d*$/.test(sizeText)) throw new MobileListError('Phân trang không hợp lệ.');
  const page = Number(pageText), size = Number(sizeText);
  if (!Number.isSafeInteger(page) || page > 1000000 || !Number.isSafeInteger(size) || size > 50) throw new MobileListError('Phân trang không hợp lệ.');
  const search = params.get('search')?.trim() || '', status = params.get('status') || '', store = params.get('store') || 'all';
  if (search.length > 100 || status.length > 64 || store !== 'all' && (!/^[1-9]\d*$/.test(store) || !Number.isSafeInteger(Number(store)))) throw new MobileListError('Bộ lọc không hợp lệ.');
  const sort = params.get('sort') || 'license', direction = params.get('direction') || 'asc';
  const order = { license: 'license', name: 'name', status: 'status', store_name: 'store_name' }[sort as 'license' | 'name' | 'status' | 'store_name'];
  if (!order || !['asc', 'desc'].includes(direction)) throw new MobileListError('Cột sắp xếp không hợp lệ.');
  const where = `WHERE ($1='' OR name ILIKE '%'||$1||'%' OR license ILIKE '%'||$1||'%')
    AND ($2='' OR status=$2) AND ($3::bigint IS NULL OR store_id=$3)`;
  const inventory = `SELECT i.id,i.name,i.license,i.status,i.store_id,i.store_name,i.available,
      v.brand,v.type AS vehicle_type,v.year,v.color,v.chassis,v.engine,v.odometer,v.xmin::text AS vehicle_revision
    FROM himoto.vehicle_inventory() i LEFT JOIN himoto.vehicles v ON v.id=i.id`;
  let client: Connection | undefined;
  try {
    client = await connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='20s'");
    const values = [search, status, store === 'all' ? null : Number(store)];
    const totalResult = await client.query(`SELECT count(*)::int AS total FROM (${inventory}) fleet ${where}`, values);
    const result = await client.query(`SELECT id,name,license,status,store_id,store_name,available,brand,vehicle_type AS type,year,color,chassis,engine,odometer,vehicle_revision
      FROM (${inventory}) fleet ${where} ORDER BY ${order} ${direction.toUpperCase()},id ASC LIMIT $4 OFFSET $5`,
      [...values, size, (page - 1) * size]);
    await client.query('COMMIT');
    const total = Number(totalResult.rows[0]?.total || 0);
    return { items: result.rows.map(row => ({ id: Number(row.id), name: string(row.name), license: string(row.license),
      status: vehicleStatus(row.status), storeId: numberOrNull(row.store_id), currentStoreId: numberOrNull(row.store_id),
      storeName: string(row.store_name), available: Boolean(row.available), brand: string(row.brand), type: string(row.type),
      year: numberOrNull(row.year), color: string(row.color), chassis: string(row.chassis), engine: string(row.engine),
      odometer: numberOrNull(row.odometer), revision: string(row.vehicle_revision) })),
      page, total, hasMore: page * size < total };
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client?.release(); }
}

export { ManagementTableError };

export function mobileRecordId(value: string) {
  if (!/^[1-9]\d{0,14}$/.test(value) || !Number.isSafeInteger(Number(value))) throw new MobileListError('Mã bản ghi không hợp lệ.');
  return Number(value);
}

export async function readMobileDetail(kind: Exclude<MobileListKind, 'staff'>, id: number) {
  if (kind === 'contracts') {
    const params = new URLSearchParams({ page: '1', size: '1', filter_id: String(id) });
    const result = await readMobileList('contracts', params);
    return result.items[0] || null;
  }
  if (kind === 'customers') {
    const result = await himotoPool.query(`${CUSTOMER_PROFILE_SQL} WHERE c.id=$1`, [id]);
    const row = result.rows[0];
    return row ? { id: Number(row.id), name: string(row.name), email: string(row.email), phone: string(row.phone), address: string(row.address),
      status: string(row.status), storeId: numberOrNull(row.store_id), storeName: string(row.store_name),
      contractCount: Number(row.contract_count || 0), warning: Boolean(String(row.warning || '').trim()), warningNote: string(row.warning), revision: string(row.customer_revision),
      customerType: string(row.customer_type), nationality: string(row.nationality), contactChannel: string(row.contact_channel), contactDetail: string(row.contact_detail),
      idCard: string(row.id_card), idCardIssuedOn: string(row.id_card_issued_on), idCardIssuedBy: string(row.id_card_issued_by),
      driverLicenseNumber: string(row.driver_license_number), driverLicenseIssuedOn: string(row.driver_license_issued_on),
      createdAt: string(row.created_at),
      firstRentedAt: string(row.first_rented_at), firstRentalStoreName: string(row.first_rental_store_name) } : null;
  }
    const result = await himotoPool.query(`SELECT i.id,i.name,i.license,i.status,i.store_id,i.store_name,i.available,
      v.brand,v.type,v.year,v.color,v.chassis,v.engine,v.odometer,v.xmin::text AS vehicle_revision
      FROM himoto.vehicle_inventory() i LEFT JOIN himoto.vehicles v ON v.id=i.id WHERE i.id=$1 AND i.store_id>0`, [id]);
  const row = result.rows[0];
  return row ? { id: Number(row.id), name: string(row.name), license: string(row.license), brand: string(row.brand),
    type: string(row.type), year: numberOrNull(row.year), color: string(row.color), chassis: string(row.chassis), engine: string(row.engine),
    odometer: numberOrNull(row.odometer), status: vehicleStatus(row.status), storeId: numberOrNull(row.store_id), currentStoreId: numberOrNull(row.store_id),
    storeName: string(row.store_name), available: Boolean(row.available), revision: string(row.vehicle_revision) } : null;
}
