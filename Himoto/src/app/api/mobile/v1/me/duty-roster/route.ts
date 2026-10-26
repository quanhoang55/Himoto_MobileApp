import { NextRequest } from 'next/server';
import { addDays, vietnamDate, weekStart } from '@/lib/management/duty-roster';
import { himotoPool } from '@/lib/server/himoto-database';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';

export const runtime = 'nodejs';

export const GET = withMobileRequest<{ params: Promise<Record<string, string>> }>(null, async (_request: NextRequest, _context, user) => {
  try {
    const week = weekStart(vietnamDate());
    const end = addDays(week, 7);
    const staff = await himotoPool.query(`SELECT id FROM himoto.staff_profiles
      WHERE user_id=$1 AND status IN ('active','1') ORDER BY id`, [user.id]);
    const staffIds = staff.rows.map(row => Number(row.id)).filter(id => Number.isSafeInteger(id) && id > 0);
    if (!staffIds.length) return mobileData({ week, linked: false, items: [] });

    const result = await himotoPool.query(`SELECT d.id, to_char(d.duty_date,'YYYY-MM-DD') AS duty_date,
      d.shift_name, d.role_in_shift, d.starts_at, d.ends_at, s.store_name
      FROM himoto.store_duty_schedules d LEFT JOIN himoto.stores s ON s.id=d.store_id
      WHERE d.deleted_at IS NULL AND d.staff_id=ANY($1::bigint[])
        AND ((d.starts_at<$3::timestamptz AND d.ends_at>$2::timestamptz)
          OR (d.starts_at IS NULL AND d.duty_date>=$4::date AND d.duty_date<$5::date))
      ORDER BY d.duty_date,d.starts_at,d.id LIMIT 50`,
    [staffIds, `${week}T00:00:00+07:00`, `${end}T00:00:00+07:00`, week, end]);
    return mobileData({ week, linked: true, items: result.rows.map(row => ({
      id: Number(row.id), date: String(row.duty_date || ''), shift: String(row.shift_name || ''),
      role: String(row.role_in_shift || ''), store: String(row.store_name || ''),
      startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : null,
      endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null,
    })) });
  } catch { return mobileError('UNAVAILABLE', 'Không tải được lịch trực của bạn.', 503); }
});
