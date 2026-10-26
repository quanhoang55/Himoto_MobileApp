import 'server-only';
import type { PoolClient } from 'pg';
import { himotoPool } from '../himoto-database';
import { normalizeIdCard } from '@/lib/management/contract-document';

export class MobileCustomerCreateError extends Error {
  constructor(message: string, public status: 400 | 409) { super(message); }
}

export type MobileCustomerCreateInput = { name: string; phone: string; address: string; idCard: string; storeId: number };

export function parseMobileCustomerCreate(body: Record<string, unknown>): MobileCustomerCreateInput {
  const allowed = new Set(['name', 'phone', 'address', 'idCard', 'storeId']);
  if (Object.keys(body).some(key => !allowed.has(key))) throw new MobileCustomerCreateError('Thông tin khách hàng không hợp lệ.', 400);
  const value = (key: string) => typeof body[key] === 'string' ? body[key].trim() as string : '';
  const name = value('name'), phone = value('phone'), address = value('address'), idCard = normalizeIdCard(value('idCard'));
  const storeId = body.storeId;
  if (!name || name.length > 255 || !address || address.length > 2000 || !/^\+?\d{9,13}$/.test(phone.replace(/[\s.()-]/g, '')) ||
      !/^\d{9}$|^\d{12}$/.test(idCard) || !Number.isSafeInteger(storeId) || Number(storeId) <= 0) {
    throw new MobileCustomerCreateError('Kiểm tra họ tên, số điện thoại, địa chỉ, CCCD/CMND và cơ sở.', 400);
  }
  return { name, phone, address, idCard, storeId: Number(storeId) };
}

type Connection = Pick<PoolClient, 'query' | 'release'>;
export async function createMobileCustomer(input: MobileCustomerCreateInput, connect: () => Promise<Connection> = () => himotoPool.connect()) {
  const client = await connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    const store = await client.query('SELECT id FROM himoto.store_directory() WHERE id=$1', [input.storeId]);
    if (!store.rowCount) throw new MobileCustomerCreateError('Cơ sở đã chọn không còn khả dụng.', 400);
    await client.query('LOCK TABLE himoto.customers IN SHARE ROW EXCLUSIVE MODE');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [input.idCard]);
    const duplicate = await client.query(
      'SELECT id FROM himoto.find_customer_duplicate($1,$2,NULL) AS id WHERE id IS NOT NULL',
      [input.idCard, input.phone.replace(/\D/g, '')],
    );
    if (duplicate.rowCount) throw new MobileCustomerCreateError('Khách hàng này đã có trong danh sách. Hãy tra cứu trước khi tạo mới.', 409);
    const result = await client.query(
      `INSERT INTO himoto.customers (name, phone, email, address, id_card, status, store_id, warning, driver_license_number, driver_license_issued_on, relatives, id_card_issued_on, id_card_issued_by, customer_type, nationality, contact_channel, contact_detail, created_at, updated_at)
       VALUES ($1, $2, NULL, $3, $4, 1, $5, NULL, NULL, NULL, '[]'::jsonb, NULL, NULL, 'vietnam', '', '', '', now(), now())
       RETURNING id, name`,
      [input.name, input.phone, input.address, input.idCard, input.storeId],
    );
    await client.query('COMMIT');
    return { id: Number(result.rows[0].id), name: String(result.rows[0].name) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}
