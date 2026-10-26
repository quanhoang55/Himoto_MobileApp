import { NextRequest } from 'next/server';
import { CONTRACT_LIST_SQL, DraftSaveError, saveDatabaseDraft } from '@/lib/server/contract-drafts';
import { contractVehicleDetailsSql } from '@/lib/server/contract-vehicle-reads';
import { deleteContractDraft, DraftDeleteError } from '@/lib/server/contract-draft-delete';
import { himotoPool } from '@/lib/server/himoto-database';
import { MobileBodyError, readMobileJson } from '@/lib/server/mobile/mobile-body';
import { mobileContractDraft, mobileDraftStoreError } from '@/lib/server/mobile/mobile-contract-drafts';
import { MobileListError, mobileRecordId } from '@/lib/server/mobile/mobile-lists';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

function failure(error: unknown) {
  if (error instanceof MobileBodyError || error instanceof MobileListError) return mobileError('INVALID_INPUT', error.message, 400);
  if (error instanceof DraftSaveError || error instanceof DraftDeleteError) return mobileError(error.status === 409 ? 'CONFLICT' : error.status === 404 ? 'NOT_FOUND' : 'INVALID_INPUT', error.message, error.status);
  if (error instanceof SyntaxError) return mobileError('INVALID_INPUT', 'Thông tin bản nháp không hợp lệ.', 400);
  if (error && typeof error === 'object' && 'code' in error && error.code === '23505') return mobileError('CONFLICT', 'Số hợp đồng đã được sử dụng.', 409);
  return mobileError('UNAVAILABLE', 'Không thực hiện được yêu cầu bản nháp. Vui lòng thử lại.', 503);
}

export const GET = withMobileRequest<Context>('contracts.read', async (_request: NextRequest, context) => {
  let client;
  try {
    const id = mobileRecordId((await context.params).id);
    client = await himotoPool.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await client.query(contractVehicleDetailsSql(`${CONTRACT_LIST_SQL} AND o.id=$1 AND o.order_status='draft'`), [id]);
    await client.query('COMMIT');
    if (!result.rows[0]) return mobileError('NOT_FOUND', 'Không tìm thấy bản nháp trong phạm vi được phép.', 404);
    const draft = mobileContractDraft(result.rows[0]);
    if (!draft.edits.draft || typeof draft.edits.draft !== 'object') return mobileError('CONFLICT', 'Bản nháp không có dữ liệu để chỉnh sửa.', 409);
    return mobileData(draft);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return failure(error);
  } finally { client?.release(); }
});

export const PATCH = withMobileRequest<Context>('contracts.draft', async (request: NextRequest, context, user) => {
  let client;
  try {
    const id = mobileRecordId((await context.params).id);
    const body = await readMobileJson(request, 128 * 1024);
    if (Object.keys(body).length !== 1 || !body.edits || typeof body.edits !== 'object' || Array.isArray(body.edits)) throw new MobileBodyError('Thông tin bản nháp không hợp lệ.');
    const edits = body.edits as Record<string, unknown>;
    const scope = mobileDraftStoreError(edits, user);
    if (scope) return mobileError(scope.code, scope.message, scope.status);
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const saved = await saveDatabaseDraft(client, id, edits);
    await client.query('COMMIT');
    return mobileData(mobileContractDraft(saved));
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return failure(error);
  } finally { client?.release(); }
}, 'mobile_contract_draft_write');

export const DELETE = withMobileRequest<Context>('contracts.draft', async (request: NextRequest, context, user) => {
  let client;
  try {
    const id = mobileRecordId((await context.params).id);
    const body = await readMobileJson(request, 1024);
    if (Object.keys(body).length !== 1 || typeof body.revision !== 'string') throw new MobileBodyError('Tải lại bản nháp trước khi xóa.');
    client = await himotoPool.connect();
    await client.query('BEGIN');
    await deleteContractDraft(client, id, body.revision, user.id);
    await client.query('COMMIT');
    return mobileData({ id, deleted: true });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return failure(error);
  } finally { client?.release(); }
}, 'mobile_contract_draft_write');
