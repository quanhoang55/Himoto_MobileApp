import 'server-only';
import type { DutySchedule } from '@/lib/management/duty-roster';

export function mobileDuty(row: DutySchedule) {
  return {
    id: row.id, storeId: row.store_id, storeName: row.store_name, staffId: row.staff_id,
    staffName: row.staff_name, date: row.duty_date, shiftName: row.shift_name,
    roleInShift: row.role_in_shift, notes: row.notes, startsAt: row.starts_at,
    endsAt: row.ends_at, revision: row.revision,
  };
}
