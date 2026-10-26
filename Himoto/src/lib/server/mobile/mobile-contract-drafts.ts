import 'server-only';
import type { ManagementRow } from '@/lib/management/types';

type DraftRow = ManagementRow & {
  draft_payload?: unknown;
  draft_revision?: string;
  contract_number?: string | null;
  draft_reference?: string | null;
  rental_type?: string | null;
  notes?: string | null;
};

export function mobileDraftStoreError(
  input: unknown,
  user: { access_role?: string; scope_all?: boolean; store_id?: number | null },
) {
  const edits = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const draft = edits.draft && typeof edits.draft === 'object' && !Array.isArray(edits.draft)
    ? edits.draft as Record<string, unknown>
    : {};
  const storeId = draft.store_id;
  if (typeof storeId !== 'string' || !/^[1-9]\d*$/.test(storeId) || !Number.isSafeInteger(Number(storeId))) {
    return { status: 400, code: 'INVALID_INPUT', message: 'Chọn cơ sở ghi nhận hợp đồng.' };
  }
  if (user.access_role !== 'admin' && !user.scope_all && Number(storeId) !== Number(user.store_id)) {
    return { status: 403, code: 'FORBIDDEN', message: 'Cơ sở nằm ngoài phạm vi được phân công.' };
  }
  return null;
}

export function mobileContractDraft(row: DraftRow) {
  const payload = row.draft_payload && typeof row.draft_payload === 'object'
    ? row.draft_payload as Record<string, unknown>
    : {};
  const composer = payload.management_composer && typeof payload.management_composer === 'object'
    ? payload.management_composer as Record<string, unknown>
    : {};
  return {
    id: Number(row.id),
    code: String(row.contract_number || row.draft_reference || `#${row.id}`),
    status: 'draft' as const,
    storeId: row.store_id == null ? null : Number(row.store_id),
    storeName: String(row.store_name || ''),
    revision: String(row.draft_revision || ''),
    edits: {
      draft: composer.draft,
      status: 'draft' as const,
      rental_type: String(composer.rental_type || row.rental_type || 'daily'),
      notes: String(composer.notes || row.notes || ''),
      revision: String(row.draft_revision || ''),
    },
  };
}
