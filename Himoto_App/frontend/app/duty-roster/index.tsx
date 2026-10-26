import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../src/core/api';
import type { DutyRoster, DutySchedule, ListResult, RecordItem } from '../../src/core/models';
import { can, useSession } from '../../src/core/session';

type Store = { id: number; name: string };
type DutyForm = { storeId: number | null; staffId: number | null; date: string; startTime: string; endDate: string; endTime: string; shiftName: string; role: string; notes: string };
const dateText = (value: string) => value.split('-').reverse().join('/');
const displayDay = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit' }).format(new Date(`${value}T00:00:00+07:00`));
const displayTime = (value: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)) : 'Chưa có giờ';
const addDays = (value: string, days: number) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const vietnamToday = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find(row => row.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};
const weekStart = (value: string) => {
  const day = new Date(`${value}T00:00:00Z`).getUTCDay();
  return addDays(value, -((day + 6) % 7));
};
const newRequestId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, token => {
  const random = Math.floor(Math.random() * 16);
  return (token === 'x' ? random : (random & 3) | 8).toString(16);
});
const emptyForm = (week: string, stores: Store[], selectedStore: string): DutyForm => ({
  storeId: selectedStore === 'all' ? stores[0]?.id || null : Number(selectedStore) || null,
  staffId: null, date: week, startTime: '08:00', endDate: week, endTime: '17:00', shiftName: 'Ca trực', role: 'Nhân viên trực', notes: '',
});
function formFromRow(row: DutySchedule): DutyForm {
  const local = (value: string | null) => value ? new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 16) : '';
  const start = local(row.startsAt), end = local(row.endsAt);
  return { storeId: row.storeId, staffId: row.staffId, date: start.slice(0, 10) || row.date, startTime: start.slice(11, 16), endDate: end.slice(0, 10) || row.date, endTime: end.slice(11, 16), shiftName: row.shiftName, role: row.roleInShift, notes: row.notes };
}

export default function DutyRosterScreen() {
  const { user } = useSession();
  const writable = can(user, 'hr.write');
  const [week, setWeek] = useState(() => weekStart(vietnamToday()));
  const [storeFilter, setStoreFilter] = useState(user?.scope_all ? 'all' : String(user?.store_id || ''));
  const [stores, setStores] = useState<Store[]>([]);
  const [staff, setStaff] = useState<RecordItem[]>([]);
  const [schedules, setSchedules] = useState<DutySchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [optionsError, setOptionsError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DutySchedule | null>(null);
  const [form, setForm] = useState<DutyForm>(() => emptyForm(weekStart(vietnamToday()), [], user?.scope_all ? 'all' : String(user?.store_id || '')));
  const [staffSearch, setStaffSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [requestId, setRequestId] = useState(newRequestId);
  const [reload, setReload] = useState(0);
  const busy = useRef(false);
  const today = vietnamToday();
  const readableStores = user?.scope_all ? stores : stores.filter(store => store.id === user?.store_id);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams({ week });
      if (storeFilter !== 'all' && storeFilter) query.set('store_id', storeFilter);
      const result = await apiGet<DutyRoster>(`/duty-roster?${query}`);
      setSchedules(result.schedules);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được lịch trực.'); }
    finally { setLoading(false); }
  }, [week, storeFilter]);
  useEffect(() => { void load(); }, [load, reload]);
  useEffect(() => {
    let active = true;
    void apiGet<{ stores: Store[] }>('/bootstrap').then(result => { if (active) setStores(result.stores); }).catch(cause => { if (active) setOptionsError(cause instanceof Error ? cause.message : 'Không tải được cơ sở.'); });
    return () => { active = false; };
  }, []);

  const loadStaff = async () => {
    try {
      const first = await apiGet<ListResult<RecordItem>>('/staff?page=1&size=50&status=active');
      const people = [...first.items];
      let page = 2;
      let hasMore = first.hasMore;
      while (hasMore && page <= 10) {
        const next = await apiGet<ListResult<RecordItem>>(`/staff?page=${page}&size=50&status=active`);
        people.push(...next.items); hasMore = next.hasMore; page++;
      }
      setStaff(people);
      setOptionsError('');
    } catch (cause) { setOptionsError(cause instanceof Error ? cause.message : 'Không tải được danh sách nhân sự.'); }
  };
  const openCreate = async () => {
    setEditing(null); setForm(emptyForm(week, readableStores, storeFilter)); setFormError(''); setStaffSearch(''); setRequestId(newRequestId()); setFormOpen(true);
    if (!staff.length) await loadStaff();
  };
  const openEdit = async (row: DutySchedule) => {
    setEditing(row); setForm(formFromRow(row)); setFormError(''); setStaffSearch(''); setFormOpen(true);
    if (!staff.length) await loadStaff();
  };
  const save = async () => {
    if (busy.current) return;
    if (!form.storeId || !form.staffId) { setFormError('Chọn cơ sở và nhân viên.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || !/^\d{2}:\d{2}$/.test(form.startTime) || !/^\d{4}-\d{2}-\d{2}$/.test(form.endDate) || !/^\d{2}:\d{2}$/.test(form.endTime)) {
      setFormError('Nhập ngày theo YYYY-MM-DD và giờ theo HH:mm.'); return;
    }
    busy.current = true; setSaving(true); setFormError('');
    const body = { store_id: form.storeId, staff_id: form.staffId, starts_at: `${form.date}T${form.startTime}`, ends_at: `${form.endDate}T${form.endTime}`, shift_name: form.shiftName, role_in_shift: form.role, notes: form.notes,
      ...(editing ? { revision: editing.revision } : { request_id: requestId }) };
    try {
      if (editing) await apiPatch(`/duty-roster/${editing.id}`, body);
      else await apiPost('/duty-roster', body);
      setFormOpen(false); setEditing(null); setReload(value => value + 1);
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Không lưu được ca trực.'); }
    finally { busy.current = false; setSaving(false); }
  };
  const remove = (row: DutySchedule) => Alert.alert('Xóa ca trực?', `Xóa ca ${row.shiftName} của ${row.staffName} tại ${row.storeName}, ngày ${dateText(row.date)}?`, [
    { text: 'Hủy', style: 'cancel' },
    { text: 'Xóa', style: 'destructive', onPress: () => void (async () => {
      try { await apiDelete(`/duty-roster/${row.id}`, { revision: row.revision }); setReload(value => value + 1); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Không xóa được ca trực.'); }
    })() },
  ]);
  const visibleStaff = staff.filter(person => `${person.name} ${person.code || ''} ${person.storeName || ''}`.toLocaleLowerCase('vi').includes(staffSearch.trim().toLocaleLowerCase('vi'))).slice(0, 12);

  return <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}>
      <Text style={styles.title}>Lịch trực cơ sở</Text>
      <Text style={styles.subtitle}>Phân ca theo tuần, nhân viên và cơ sở.</Text>
      <View style={styles.weekBar}>
        <Pressable style={styles.weekButton} onPress={() => setWeek(value => addDays(value, -7))}><Text style={styles.weekButtonText}>‹</Text></Pressable>
        <View style={styles.weekText}><Text style={styles.weekRange}>{displayDay(week)} – {displayDay(addDays(week, 6))}</Text><Pressable onPress={() => setWeek(weekStart(today))}><Text style={styles.currentWeek}>Tuần này</Text></Pressable></View>
        <Pressable style={styles.weekButton} onPress={() => setWeek(value => addDays(value, 7))}><Text style={styles.weekButtonText}>›</Text></Pressable>
      </View>
      {user?.scope_all ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storeFilters} contentContainerStyle={styles.storeFiltersContent}>
        {[{ id: 'all', name: 'Tất cả cơ sở' }, ...stores.map(store => ({ id: String(store.id), name: store.name }))].map(store => <Pressable key={store.id} style={[styles.filterPill, storeFilter === store.id && styles.filterPillSelected]} onPress={() => setStoreFilter(store.id)}><Text style={[styles.filterText, storeFilter === store.id && styles.filterTextSelected]}>{store.name}</Text></Pressable>)}
      </ScrollView> : null}
      <View style={styles.summary}><Text style={styles.summaryLabel}>Ca trực trong tuần</Text><Text style={styles.summaryValue}>{loading ? '—' : schedules.length}</Text></View>
      {error ? <Pressable onPress={() => void load()}><Text style={styles.error}>{error} · Chạm để thử lại</Text></Pressable> : null}
      {optionsError ? <Text style={styles.error}>{optionsError}</Text> : null}
      {!loading && !error && !schedules.length ? <Text style={styles.empty}>Chưa có ca trực trong tuần này.</Text> : null}
      {schedules.map(row => <View key={row.id} style={[styles.shiftCard, row.date === today && styles.shiftToday]}>
        <View style={styles.shiftHeader}><Text style={styles.staffName}>{row.staffName}</Text>{row.date === today ? <Text style={styles.todayTag}>HÔM NAY</Text> : null}</View>
        <Text style={styles.shiftDetail}>{displayDay(row.date)} · {row.storeName}</Text>
        <Text style={styles.shiftTime}>{row.startsAt && row.endsAt ? `${displayTime(row.startsAt)} – ${displayTime(row.endsAt)}` : 'Chưa có giờ cụ thể'}</Text>
        <Text style={styles.shiftDetail}>{row.shiftName} · {row.roleInShift}</Text>
        {row.notes ? <Text style={styles.shiftNotes}>{row.notes}</Text> : null}
        {writable ? <View style={styles.rowActions}><Pressable style={styles.secondaryButton} onPress={() => void openEdit(row)}><Text style={styles.secondaryButtonText}>Sửa</Text></Pressable><Pressable style={styles.deleteButton} onPress={() => remove(row)}><Text style={styles.deleteText}>Xóa</Text></Pressable></View> : null}
      </View>)}
      {writable ? <Pressable style={styles.primaryButton} onPress={() => void openCreate()}><Text style={styles.primaryButtonText}>+ Thêm ca trực</Text></Pressable> : null}
    </ScrollView>

    <Modal visible={formOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy.current) setFormOpen(false); }}>
      <SafeAreaView style={styles.modalRoot} edges={['top', 'left', 'right', 'bottom']}>
        <KeyboardAvoidingView style={styles.modalBody} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>{editing ? 'Sửa ca trực' : 'Thêm ca trực'}</Text><Pressable disabled={saving} onPress={() => setFormOpen(false)}><Text style={styles.closeText}>Đóng</Text></Pressable></View>
            <Text style={styles.formHint}>Ca qua đêm: nhập ngày kết thúc vào ngày kế tiếp. Một ca tối đa 24 giờ.</Text>
            <Text style={styles.fieldLabel}>Cơ sở</Text>
            <View style={styles.optionList}>{readableStores.map(store => <Pressable key={store.id} style={[styles.option, form.storeId === store.id && styles.optionSelected]} onPress={() => setForm(previous => ({ ...previous, storeId: store.id }))}><Text style={styles.optionText}>{store.name}</Text></Pressable>)}</View>
            <Text style={styles.fieldLabel}>Nhân viên</Text>
            <TextInput style={styles.input} placeholder="Tìm tên hoặc mã nhân viên" value={staffSearch} onChangeText={setStaffSearch} />
            <View style={styles.optionList}>{visibleStaff.map(person => <Pressable key={person.id} style={[styles.option, form.staffId === person.id && styles.optionSelected]} onPress={() => setForm(previous => ({ ...previous, staffId: person.id }))}><Text style={styles.optionText}>{person.name}</Text><Text style={styles.optionDetail}>{person.position || person.storeName || person.code}</Text></Pressable>)}</View>
            <Text style={styles.fieldLabel}>Bắt đầu · ngày (YYYY-MM-DD)</Text><TextInput style={styles.input} value={form.date} placeholder="2026-10-26" onChangeText={value => setForm(previous => ({ ...previous, date: value }))} />
            <Text style={styles.fieldLabel}>Bắt đầu · giờ (HH:mm)</Text><TextInput style={styles.input} value={form.startTime} placeholder="08:00" keyboardType="numbers-and-punctuation" onChangeText={value => setForm(previous => ({ ...previous, startTime: value }))} />
            <Text style={styles.fieldLabel}>Kết thúc · ngày (YYYY-MM-DD)</Text><TextInput style={styles.input} value={form.endDate} placeholder="2026-10-26" onChangeText={value => setForm(previous => ({ ...previous, endDate: value }))} />
            <Text style={styles.fieldLabel}>Kết thúc · giờ (HH:mm)</Text><TextInput style={styles.input} value={form.endTime} placeholder="17:00" keyboardType="numbers-and-punctuation" onChangeText={value => setForm(previous => ({ ...previous, endTime: value }))} />
            <Text style={styles.fieldLabel}>Tên ca</Text><TextInput style={styles.input} value={form.shiftName} maxLength={80} onChangeText={value => setForm(previous => ({ ...previous, shiftName: value }))} />
            <Text style={styles.fieldLabel}>Vai trò trong ca</Text><TextInput style={styles.input} value={form.role} maxLength={100} onChangeText={value => setForm(previous => ({ ...previous, role: value }))} />
            <Text style={styles.fieldLabel}>Ghi chú</Text><TextInput style={[styles.input, styles.notes]} multiline value={form.notes} maxLength={2000} onChangeText={value => setForm(previous => ({ ...previous, notes: value }))} />
            {formError ? <Text style={styles.error}>{formError}</Text> : null}
            <Pressable style={[styles.primaryButton, saving && styles.buttonDisabled]} disabled={saving} onPress={() => void save()}><Text style={styles.primaryButtonText}>{saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Lưu ca trực'}</Text></Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafa' }, content: { padding: 20, paddingTop: 26, paddingBottom: 36 },
  title: { color: '#171717', fontSize: 28, fontWeight: '800', letterSpacing: -0.7 }, subtitle: { color: '#737373', fontSize: 14, marginTop: 7, marginBottom: 20 },
  weekBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#ececec', borderRadius: 16, padding: 10 },
  weekButton: { width: 42, height: 42, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fafafa', borderRadius: 12 }, weekButtonText: { color: '#e3262e', fontSize: 28, fontWeight: '700', marginTop: -3 },
  weekText: { alignItems: 'center' }, weekRange: { color: '#171717', fontSize: 13, fontWeight: '700' }, currentWeek: { color: '#e3262e', fontSize: 12, fontWeight: '700', marginTop: 5 },
  storeFilters: { marginTop: 12, maxHeight: 42 }, storeFiltersContent: { gap: 8 }, filterPill: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#ececec' }, filterPillSelected: { backgroundColor: '#fff5f5', borderColor: '#e3262e' }, filterText: { color: '#737373', fontSize: 12, fontWeight: '600' }, filterTextSelected: { color: '#e3262e' },
  summary: { marginTop: 14, marginBottom: 12, padding: 17, borderRadius: 16, backgroundColor: '#fff5f5', borderLeftWidth: 3, borderLeftColor: '#e3262e', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, summaryLabel: { color: '#171717', fontSize: 15, fontWeight: '700' }, summaryValue: { color: '#e3262e', fontSize: 26, fontWeight: '800' },
  shiftCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#ececec', borderRadius: 16, padding: 17, marginBottom: 11 }, shiftToday: { borderColor: '#e3262e', backgroundColor: '#fffafa' }, shiftHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, staffName: { color: '#171717', fontSize: 17, fontWeight: '800' }, todayTag: { color: '#e3262e', fontSize: 10, fontWeight: '800' }, shiftDetail: { color: '#737373', fontSize: 13, marginTop: 6 }, shiftTime: { color: '#171717', fontSize: 15, fontWeight: '700', marginTop: 9 }, shiftNotes: { color: '#737373', fontSize: 13, lineHeight: 18, marginTop: 8 },
  rowActions: { flexDirection: 'row', gap: 9, marginTop: 14 }, secondaryButton: { borderWidth: 1, borderColor: '#e3262e', borderRadius: 12, paddingHorizontal: 17, paddingVertical: 10 }, secondaryButtonText: { color: '#e3262e', fontWeight: '700' }, deleteButton: { borderWidth: 1, borderColor: '#ececec', borderRadius: 12, paddingHorizontal: 17, paddingVertical: 10 }, deleteText: { color: '#737373', fontWeight: '700' },
  primaryButton: { backgroundColor: '#e3262e', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 10 }, primaryButtonText: { color: '#ffffff', fontWeight: '800', fontSize: 15 }, buttonDisabled: { opacity: 0.6 }, error: { color: '#8f1414', marginVertical: 12, lineHeight: 19 }, empty: { color: '#737373', textAlign: 'center', marginVertical: 26 },
  modalRoot: { flex: 1, backgroundColor: '#fafafa' }, modalBody: { flex: 1 }, modalContent: { padding: 20, paddingBottom: 40 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }, modalTitle: { color: '#171717', fontSize: 25, fontWeight: '800' }, closeText: { color: '#e3262e', fontWeight: '700', padding: 8 }, formHint: { color: '#737373', fontSize: 13, lineHeight: 19, marginBottom: 18 },
  fieldLabel: { color: '#171717', fontSize: 14, fontWeight: '700', marginTop: 14, marginBottom: 8 }, input: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d6d6d6', borderRadius: 13, minHeight: 50, paddingHorizontal: 14, color: '#171717', fontSize: 15 }, notes: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
  optionList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, option: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d6d6d6', borderRadius: 12, padding: 11 }, optionSelected: { backgroundColor: '#fff5f5', borderColor: '#e3262e' }, optionText: { color: '#171717', fontSize: 13, fontWeight: '700' }, optionDetail: { color: '#737373', fontSize: 11, marginTop: 4 },
});
