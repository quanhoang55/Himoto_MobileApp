import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { DraftSaveError, saveDatabaseDraft, CONTRACT_LIST_SQL } from '@/lib/server/contract-drafts';
import { contractVehicleDetailsSql } from '@/lib/server/contract-vehicle-reads';
import { himotoPool } from '@/lib/server/himoto-database';
import { MobileBodyError, readMobileJson } from '@/lib/server/mobile/mobile-body';
import { mobileContractDraft, mobileDraftStoreError } from '@/lib/server/mobile/mobile-contract-drafts';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';

export const runtime = 'nodejs';

function failure(error: unknown) {
  if (error instanceof MobileBodyError) return mobileError('INVALID_INPUT', error.message, 400);
  if (error instanceof DraftSaveError) return mobileError(error.status === 409 ? 'CONFLICT' : error.status === 404 ? 'NOT_FOUND' : 'INVALID_INPUT', error.message, error.status);
  if (error instanceof SyntaxError) return mobileError('INVALID_INPUT', 'Thông tin bản nháp không hợp lệ.', 400);
  if (error && typeof error === 'object' && 'code' in error && error.code === '23505') return mobileError('CONFLICT', 'Số hợp đồng đã được sử dụng.', 409);
  return mobileError('UNAVAILABLE', 'Không lưu được bản nháp hợp đồng. Vui lòng thử lại.', 503);
}

export const POST = withMobileRequest<{ params: Promise<Record<string, string>> }>('contracts.draft', async (request, _context, user) => {
  let client;
  try {
    const body = await readMobileJson(request, 128 * 1024);
    if (Object.keys(body).length !== 2 || !body.edits || typeof body.edits !== 'object' || Array.isArray(body.edits) || typeof body.request_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id)) {
      throw new MobileBodyError('Thông tin hoặc mã yêu cầu tạo bản nháp không hợp lệ.');
    }
    const edits = body.edits as Record<string, unknown>;
    const scope = mobileDraftStoreError(edits, user);
    if (scope) return mobileError(scope.code, scope.message, scope.status);
    const requestId = body.request_id.toLowerCase();
    const bodyHash = createHash('sha256').update(JSON.stringify(edits)).digest('hex');
    client = await himotoPool.connect();
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`mobile-contract-draft:${user.id}:${requestId}`]);
    const prior = await client.query(`SELECT id,order_status,deleted_at,draft_payload #>> '{mobile_request,body_hash}' AS body_hash
      FROM himoto.orders WHERE draft_payload #>> '{mobile_request,actor_id}'=$1
        AND draft_payload #>> '{mobile_request,request_id}'=$2 LIMIT 1`, [String(user.id), requestId]);
    if (prior.rowCount) {
      const row = prior.rows[0];
      if (row.body_hash !== bodyHash) throw new DraftSaveError('Mã yêu cầu tạo bản nháp đã được dùng cho dữ liệu khác.', 409);
      if (row.deleted_at) throw new DraftSaveError('Bản nháp được tạo bởi yêu cầu này đã bị xóa.', 409);
      if (row.order_status !== 'draft') throw new DraftSaveError('Bản nháp được tạo bởi yêu cầu này đã chuyển trạng thái.', 409);
      const existing = await client.query(contractVehicleDetailsSql(`${CONTRACT_LIST_SQL} AND o.id=$1`), [Number(row.id)]);
      if (!existing.rows[0]) throw new DraftSaveError('Không tìm thấy bản nháp trong phạm vi được phép.', 404);
      await client.query('COMMIT');
      return mobileData(mobileContractDraft(existing.rows[0]));
    }
    const saved = await saveDatabaseDraft(client, null, edits);
    await client.query(`UPDATE himoto.orders SET draft_payload=jsonb_set(COALESCE(draft_payload::jsonb,'{}'::jsonb),'{mobile_request}',$2::jsonb,true) WHERE id=$1`, [saved.id, JSON.stringify({ actor_id: String(user.id), request_id: requestId, body_hash: bodyHash })]);
    await client.query('COMMIT');
    return mobileData(mobileContractDraft(saved), 201);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return failure(error);
  } finally { client?.release(); }
}, 'mobile_contract_draft_write');
