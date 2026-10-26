export type ListResult<T> = { items: T[]; page: number; total: number; hasMore: boolean };
export type RecordItem = { id: number; code?: string; name: string; status: string; revision?: string; storeId?: number | null; storeName?: string; position?: string; license?: string; brand?: string; type?: string; year?: number | null; color?: string; chassis?: string; engine?: string; odometer?: number | null; currentStoreId?: number | null; locationStatus?: string; gpsLastAt?: string; available?: boolean; customerName?: string; customerPhone?: string; phone?: string; email?: string; address?: string; contractCount?: number; warning?: boolean; warningNote?: string; customerType?: string; nationality?: string; contactChannel?: string; contactDetail?: string; idCard?: string; idCardIssuedOn?: string; idCardIssuedBy?: string; driverLicenseNumber?: string; driverLicenseIssuedOn?: string; relatives?: unknown[]; createdAt?: string; firstRentedAt?: string; firstRentalStoreName?: string; startDate?: string; endDate?: string; totalAmount?: number | null; paidAmount?: number | null };
export type MobileContractDraft = {
  id: number; code: string; status: 'draft'; storeId: number | null; storeName: string; revision: string;
  edits: { draft: Record<string, unknown>; status: 'draft'; rental_type: string; notes: string; revision?: string };
};
export type ContractHistory = {
  changes: { id: string; kind: string; at: string; actor: string; title: string; detail: string; amount: number | null }[];
  cashflow: { id: number; at: string; type: 'income' | 'expense'; reason: string; note: string; amount: number; method: string; actor: string; status: string }[];
};
export type Dashboard = { contracts: { active: number; overdue: number } | null; fleet: { total: number } };
export type FinanceSummary = { period: { from: string; to: string }; revenue: number; income: number; expense: number; incomeCount: number; expenseCount: number };
export type MyDutyRoster = { week: string; linked: boolean; items: { id: number; date: string; shift: string; role: string; store: string; startsAt: string | null; endsAt: string | null }[] };
export type DutySchedule = { id: number; storeId: number; storeName: string; staffId: number | null; staffName: string; date: string; shiftName: string; roleInShift: string; notes: string; startsAt: string | null; endsAt: string | null; revision: string };
export type DutyRoster = { week: string; schedules: DutySchedule[] };
export type VehicleHistory = { id: string; action: string; label: string; vehicleName: string; license: string; location: string; responsibleStore: string; beneficiaryStore: string; at: string | null; actor: string }[];
