import { NextRequest } from 'next/server';
import { hasPermission } from '@/lib/management/permissions';
import { dataAccess } from '@/lib/server/access-context';
import { himotoPool } from '@/lib/server/himoto-database';
import { readOperationsSummary } from '@/lib/server/page-summaries';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';

export const runtime = 'nodejs';

export const GET = withMobileRequest<{ params: Promise<Record<string, string>> }>(null, async (_request: NextRequest, _context, user) => {
  try {
    const contracts = hasPermission(user, 'contracts.read') ? await readOperationsSummary(himotoPool) : null;
    const fleet = await dataAccess.run({ ...user, store_id: user.store_id ?? null,
      scope_all: user.scope_all === true, operation: 'fleet_read' },
      () => himotoPool.query('SELECT count(*)::int AS total FROM himoto.vehicle_inventory() WHERE store_id>0'));
    return mobileData({ contracts: contracts ? {
      active: contracts.stores.reduce((sum, row) => sum + Number(row.active || 0), 0),
      overdue: contracts.stores.reduce((sum, row) => sum + Number(row.overdue || 0), 0),
    } : null, fleet: { total: Number(fleet.rows[0]?.total || 0) } });
  } catch { return mobileError('UNAVAILABLE', 'Không tải được tổng quan.', 503); }
});
