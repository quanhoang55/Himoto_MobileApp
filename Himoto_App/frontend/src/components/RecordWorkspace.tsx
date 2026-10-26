import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RecordList, type RecordSnapshot } from './RecordList';
import { ContractWorkflows } from './ContractWorkflows';
import { ContractReturnWorkflow } from './ContractReturnWorkflow';
import { apiDelete, apiGet, apiPatch, apiPost } from '../core/api';
import { can, useSession } from '../core/session';
import type { MobileContractDraft, RecordItem } from '../core/models';

type Kind = 'contracts' | 'vehicles' | 'customers';
type DraftField = { key: string; label: string; placeholder: string; keyboard?: 'default' | 'phone-pad' | 'numeric' };
type ContractEdits = MobileContractDraft['edits'];
type VehicleEdits = { name: string; license: string; brand: string; type: string; year: string; store_id: string; status: string; color: string; chassis: string; engine: string; odometer: string; note: string; revision?: string };

const vehicleTypes = [{ value: 'xega', label: 'Xe ga' }, { value: 'xeso', label: 'Xe số' }, { value: 'xecon', label: 'Xe côn tay' }, { value: 'xesh', label: 'Xe SH' }, { value: 'xe_dien', label: 'Xe điện' }];
const vehicleStatuses = [{ value: 'ready', label: 'Lưu kho' }, { value: 'using', label: 'Đang thuê' }, { value: 'repairing', label: 'Bảo dưỡng' }, { value: 'pending', label: 'Đặt trước' }, { value: 'sold', label: 'Đã bán' }, { value: 'bad_debt', label: 'Nợ xấu' }, { value: 'broken', label: 'Hỏng' }, { value: 'in_transit', label: 'Chờ luân chuyển' }];
const initialVehicleEdits = (storeId: string): VehicleEdits => ({ name: '', license: '', brand: '', type: 'xega', year: String(new Date().getFullYear()), store_id: storeId, status: 'ready', color: '', chassis: '', engine: '', odometer: '', note: '' });

const initialContractEdits = (storeId: string): ContractEdits => {
  const start = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 16);
  const end = new Date(new Date(`${start}:00+07:00`).getTime() + 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000).toISOString().slice(0, 16);
  return {
    status: 'draft', rental_type: 'daily', notes: '',
    draft: {
      contract_number: '', signed_on: start.slice(0, 10), store_id: storeId, vehicle_store_id: storeId,
      staff_id: '', staff_name: '', customer_id: null,
      customer: Object.fromEntries(['name','phone','email','address','id_card','id_card_issued_on','id_card_issued_by','driver_license_number','driver_license_issued_on','birthday','relatives_text','warning_note','customer_type','nationality','contact_channel','contact_detail'].map(key => [key, ''])),
      vehicles: [{ id: '', name: '', license: '', brand: '', type_text: '', color: '', year: '', driver_name: '', driver_license_number: '', driver_license_issued_on: '', borrow_hats: '02', borrow_raincoats: '02', rent_at: '', return_at: '' }],
      start_date: start, end_date: end, unit_price: '', total_amount: '', paid_amount: '0', deposit_amount: '',
      package_name: 'Theo ngày', payment_method: '', deposit_payment_method: '', collateral_description: '',
      customer_source: '', customer_source_url: '', authorization_date: '', created_on: start.slice(0, 10),
      relatives: [{ name: '', relationship: '', phone: '' }, { name: '', relationship: '', phone: '' }],
    },
  };
};

const requestId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, token => {
  const random = Math.floor(Math.random() * 16);
  return (token === 'x' ? random : (random & 3) | 8).toString(16);
});

const settings: Record<Kind, { title: string; action: string; permission: string; fields: DraftField[] }> = {
  contracts: {
    title: 'Hợp đồng', action: 'Tạo hợp đồng nháp', permission: 'contracts.draft', fields: [
      { key: 'customer', label: 'Khách hàng', placeholder: 'Tên khách hàng' },
      { key: 'phone', label: 'Số điện thoại', placeholder: 'Số điện thoại liên hệ', keyboard: 'phone-pad' },
      { key: 'license', label: 'Biển số xe', placeholder: 'Biển số xe cho thuê' },
      { key: 'start', label: 'Ngày bắt đầu', placeholder: 'DD/MM/YYYY' },
      { key: 'end', label: 'Ngày dự kiến trả', placeholder: 'DD/MM/YYYY' },
    ],
  },
  vehicles: {
    title: 'Đội xe', action: 'Thêm xe', permission: 'vehicles.write', fields: [
      { key: 'name', label: 'Tên / dòng xe', placeholder: 'Ví dụ: Vision 110' },
      { key: 'license', label: 'Biển số', placeholder: 'Biển số xe' },
      { key: 'brand', label: 'Hãng xe', placeholder: 'Ví dụ: Honda' },
      { key: 'year', label: 'Năm sản xuất', placeholder: 'YYYY', keyboard: 'numeric' },
    ],
  },
  customers: {
    title: 'Khách hàng', action: 'Thêm khách hàng', permission: 'customers.write', fields: [
      { key: 'name', label: 'Họ và tên', placeholder: 'Tên khách hàng' },
      { key: 'phone', label: 'Số điện thoại', placeholder: 'Số điện thoại liên hệ', keyboard: 'phone-pad' },
      { key: 'idCard', label: 'Giấy tờ định danh', placeholder: 'Có thể bổ sung sau' },
      { key: 'address', label: 'Nơi ở hiện tại', placeholder: 'Địa chỉ hiện tại' },
    ],
  },
};

function loadedMetrics(kind: Kind, snapshot: RecordSnapshot) {
  const { items } = snapshot;
  if (kind === 'contracts') return [
    { label: 'Đang thuê', value: items.filter(item => item.status === 'renting').length },
    { label: 'Quá hạn', value: items.filter(item => item.status === 'overdue').length },
  ];
  if (kind === 'vehicles') return [
    { label: 'Sẵn sàng', value: items.filter(item => item.available === true).length },
    { label: 'Chờ luân chuyển', value: items.filter(item => item.status === 'in_transit').length },
  ];
  return [
    { label: 'Đã có hợp đồng', value: items.filter(item => (item.contractCount || 0) > 0).length },
    { label: 'Có cảnh báo', value: items.filter(item => item.warning).length },
  ];
}

export function RecordWorkspace({ kind }: { kind: Kind }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ action?: string }>();
  const { height } = useWindowDimensions();
  const { user } = useSession();
  const config = settings[kind];
  const [snapshot, setSnapshot] = useState<RecordSnapshot | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [stores, setStores] = useState<{ id: number; name: string }[]>([]);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [storeError, setStoreError] = useState('');
  const [contractEdits, setContractEdits] = useState<ContractEdits | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<number | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [vehicleEdits, setVehicleEdits] = useState<VehicleEdits | null>(null);
  const [editingVehicleId, setEditingVehicleId] = useState<number | null>(null);
  const [editingCustomerId, setEditingCustomerId] = useState<number | null>(null);
  const [workflowMode, setWorkflowMode] = useState<'reservation' | 'backfill' | 'renewal' | null>(null);
  const [returnWorkflowOpen, setReturnWorkflowOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const draftRequestId = useRef(requestId());
  const handledShortcutAction = useRef('');
  const [saveError, setSaveError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const onSnapshot = useCallback((next: RecordSnapshot) => setSnapshot(next), []);
  const closePreview = () => { if (savingRef.current) return; setPreviewOpen(false); setDraft({}); setContractEdits(null); setEditingDraftId(null); setVehicleEdits(null); setEditingVehicleId(null); setEditingCustomerId(null); setSaveError(''); };
  const loadStores = async (onReady?: (available: { id: number; name: string }[]) => void) => {
    setStoreError('');
    try {
      const result = await apiGet<{ stores: { id: number; name: string }[] }>('/bootstrap');
      const available = user?.scope_all ? result.stores : result.stores.filter(store => store.id === user?.store_id);
      setStores(available);
      onReady?.(available);
      if (!available.length) setStoreError('Không có cơ sở khả dụng để thao tác.');
    } catch (cause) { setStoreError(cause instanceof Error ? cause.message : 'Không tải được cơ sở.'); }
  };
  const openPreview = () => {
    setPreviewOpen(true);
    setSaveError('');
    if (kind === 'customers') {
      setStoreId(user?.store_id || null);
      void loadStores(available => setStoreId(current => current && available.some(store => store.id === current) ? current : available[0]?.id || null));
    }
    if (kind === 'contracts') {
      draftRequestId.current = requestId();
      setEditingDraftId(null);
      setContractEdits(initialContractEdits(user?.store_id ? String(user.store_id) : ''));
      void loadStores(available => setContractEdits(current => {
        if (!current || current.draft.store_id) return current;
        const firstStore = available[0] ? String(available[0].id) : '';
        return { ...current, draft: { ...current.draft, store_id: firstStore, vehicle_store_id: firstStore } };
      }));
    }
    if (kind === 'vehicles') {
      setEditingVehicleId(null);
      setVehicleEdits(initialVehicleEdits(user?.store_id ? String(user.store_id) : ''));
      void loadStores(available => setVehicleEdits(current => {
        if (!current || current.store_id) return current;
        return { ...current, store_id: available[0] ? String(available[0].id) : '' };
      }));
    }
  };
  useEffect(() => {
    if (kind !== 'contracts') return;
    const action = params.action;
    if (action !== 'create' && action !== 'backfill' && action !== 'return' && action !== 'renew') { handledShortcutAction.current = ''; return; }
    if (handledShortcutAction.current === action) return;
    handledShortcutAction.current = action;
    if (action === 'create' && can(user, 'contracts.draft')) openPreview();
    if (action === 'backfill' && can(user, 'contracts.read') && (can(user, 'contracts.draft') && can(user, 'contracts.finalize') || can(user, 'contracts.renew') || can(user, 'finance.write'))) setWorkflowMode('backfill');
    if (action === 'return' && can(user, 'contracts.return')) setReturnWorkflowOpen(true);
    if (action === 'renew' && can(user, 'contracts.renew')) setWorkflowMode('renewal');
    router.setParams({ action: undefined });
  }, [kind, params.action, router, user]);
  const saveCustomer = async () => {
    if (savingRef.current) return;
    if (!storeId && !editingCustomerId) { setSaveError('Vui lòng chọn cơ sở.'); return; }
    savingRef.current = true;
    setSaving(true); setSaveError('');
    try {
      const created = editingCustomerId
        ? await apiPatch<{ id: number }>(`/customers/${editingCustomerId}`, { name: draft.name || '', phone: draft.phone || '', email: draft.email || '', address: draft.address || '', idCard: draft.idCard || '', revision: draft.revision || '' })
        : await apiPost<{ id: number }>('/customers', { name: draft.name || '', phone: draft.phone || '', address: draft.address || '', idCard: draft.idCard || '', storeId });
      setRefreshKey(value => value + 1);
      savingRef.current = false;
      setSaving(false);
      closePreview();
      if (!editingCustomerId) router.push(`/customers/${created.id}`);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Không lưu được khách hàng.');
      savingRef.current = false;
      setSaving(false);
    }
  };
  const openCustomer = async (item: RecordItem) => {
    setPreviewOpen(true); setLoadingDraft(true); setSaveError(''); setEditingCustomerId(item.id); setDraft({});
    try {
      const result = await apiGet<RecordItem>(`/customers/${item.id}`);
      setDraft({ name: result.name || '', phone: result.phone || '', email: result.email || '', address: result.address || '', idCard: result.idCard || '', revision: result.revision || '' });
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Không tải được hồ sơ khách hàng.'); }
    finally { setLoadingDraft(false); }
  };
  const removeCustomer = (item: RecordItem) => Alert.alert('Xóa hồ sơ khách?', `Xóa ${item.name}? Hồ sơ có hợp đồng liên kết sẽ được giữ lại để bảo toàn lịch sử.`, [
    { text: 'Hủy', style: 'cancel' },
    { text: 'Xóa', style: 'destructive', onPress: () => void (async () => {
      try { await apiDelete(`/customers/${item.id}`, {}); setRefreshKey(value => value + 1); }
      catch (cause) { Alert.alert('Không xóa được', cause instanceof Error ? cause.message : 'Vui lòng thử lại.'); }
    })() },
  ]);
  const openDraft = async (item: RecordItem) => {
    setPreviewOpen(true); setLoadingDraft(true); setSaveError(''); setEditingDraftId(item.id); setContractEdits(null);
    try {
      const result = await apiGet<MobileContractDraft>(`/contracts/drafts/${item.id}`);
      setContractEdits(result.edits);
      void loadStores();
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Không tải được bản nháp.'); }
    finally { setLoadingDraft(false); }
  };
  const saveContractDraft = async () => {
    if (savingRef.current || !contractEdits) return;
    if (typeof contractEdits.draft.store_id !== 'string' || !contractEdits.draft.store_id) { setSaveError('Chọn cơ sở ghi nhận hợp đồng.'); return; }
    savingRef.current = true; setSaving(true); setSaveError('');
    try {
      if (editingDraftId) await apiPatch(`/contracts/drafts/${editingDraftId}`, { edits: contractEdits });
      else {
        const { revision: _revision, ...edits } = contractEdits;
        await apiPost('/contracts/draft', { edits, request_id: draftRequestId.current });
      }
      setRefreshKey(value => value + 1);
      savingRef.current = false; setSaving(false); closePreview();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Không lưu được bản nháp hợp đồng.');
      savingRef.current = false; setSaving(false);
    }
  };
  const removeDraft = (item: RecordItem) => Alert.alert('Xóa bản nháp?', `Xóa ${item.code || 'bản nháp này'}? Hợp đồng đã phát hành không thể xóa tại đây.`, [
    { text: 'Hủy', style: 'cancel' },
    { text: 'Xóa', style: 'destructive', onPress: () => void (async () => {
      try {
        if (!item.revision) throw new Error('Thiếu phiên bản bản nháp. Hãy làm mới danh sách rồi thử lại.');
        await apiDelete(`/contracts/drafts/${item.id}`, { revision: item.revision });
        setRefreshKey(value => value + 1);
      } catch (cause) { Alert.alert('Không xóa được', cause instanceof Error ? cause.message : 'Vui lòng thử lại.'); }
    })() },
  ]);
  const openVehicle = async (item: RecordItem) => {
    setPreviewOpen(true); setLoadingDraft(true); setSaveError(''); setEditingVehicleId(item.id); setVehicleEdits(null);
    try {
      const result = await apiGet<RecordItem>(`/vehicles/${item.id}`);
      setVehicleEdits({ name: result.name || '', license: result.license || '', brand: result.brand || '', type: result.type || 'xega',
        year: result.year == null ? '' : String(result.year), store_id: String(result.currentStoreId || result.storeId || ''), status: result.status || 'ready',
        color: result.color || '', chassis: result.chassis || '', engine: result.engine || '', odometer: result.odometer == null ? '' : String(result.odometer), note: '', revision: result.revision || '' });
      void loadStores();
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Không tải được thông tin xe.'); }
    finally { setLoadingDraft(false); }
  };
  const saveVehicle = async () => {
    if (savingRef.current || !vehicleEdits) return;
    if (!vehicleEdits.store_id) { setSaveError('Chọn cơ sở hiện tại.'); return; }
    savingRef.current = true; setSaving(true); setSaveError('');
    try {
      if (editingVehicleId) await apiPatch(`/vehicles/${editingVehicleId}`, vehicleEdits);
      else await apiPost('/vehicles', vehicleEdits);
      setRefreshKey(value => value + 1);
      savingRef.current = false; setSaving(false); closePreview();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Không lưu được thông tin xe.');
      savingRef.current = false; setSaving(false);
    }
  };
  const updateVehicleField = (key: keyof VehicleEdits, value: string) => setVehicleEdits(current => current ? { ...current, [key]: value } : current);
  const updateContractDraft = (key: string, value: string) => setContractEdits(current => current ? { ...current, draft: { ...current.draft, [key]: value } } : current);
  const updateContractCustomer = (key: string, value: string) => setContractEdits(current => current ? {
    ...current, draft: { ...current.draft, customer: { ...(current.draft.customer as Record<string, unknown>), [key]: value } },
  } : current);
  const updateContractVehicle = (key: string, value: string) => setContractEdits(current => current ? {
    ...current, draft: { ...current.draft, vehicles: [{ ...((current.draft.vehicles as Record<string, unknown>[])[0] || {}), [key]: value }] },
  } : current);
  const metrics = snapshot ? loadedMetrics(kind, snapshot) : [];

  return <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent} nestedScrollEnabled keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{config.title}</Text>
      {kind === 'contracts' ? <>
        {can(user, 'contracts.draft') ? <Pressable style={styles.contractCreateButton} accessibilityRole="button" onPress={openPreview}><Text style={styles.contractCreateText}>＋ Tạo hợp đồng nháp</Text></Pressable>
          : <Text style={styles.permissionNote}>Bạn có quyền xem hợp đồng nhưng chưa được cấp quyền lập / sửa bản nháp.</Text>}
        {can(user, 'contracts.read') && can(user, 'contracts.draft') && can(user, 'contracts.finalize') ? <Pressable style={styles.contractCreateButton} accessibilityRole="button" onPress={() => setWorkflowMode('reservation')}><Text style={styles.contractCreateText}>＋ Nhận cọc giữ xe</Text></Pressable> : null}
        {can(user, 'contracts.read') && (can(user, 'contracts.draft') && can(user, 'contracts.finalize') || can(user, 'contracts.renew') || can(user, 'finance.write')) ? <Pressable style={[styles.contractCreateButton, styles.secondaryWorkflowButton]} accessibilityRole="button" onPress={() => setWorkflowMode('backfill')}><Text style={styles.secondaryWorkflowText}>＋ Nhập bổ sung giao dịch</Text></Pressable> : null}
        {can(user, 'contracts.return') ? <Pressable style={[styles.contractCreateButton, styles.secondaryWorkflowButton]} accessibilityRole="button" onPress={() => setReturnWorkflowOpen(true)}><Text style={styles.secondaryWorkflowText}>↩ Trả xe</Text></Pressable> : null}
        {can(user, 'contracts.renew') ? <Pressable style={[styles.contractCreateButton, styles.secondaryWorkflowButton]} accessibilityRole="button" onPress={() => setWorkflowMode('renewal')}><Text style={styles.secondaryWorkflowText}>↻ Gia hạn</Text></Pressable> : null}
        </>
        : kind === 'vehicles' ? can(user, 'vehicles.write')
          ? <Pressable style={styles.contractCreateButton} accessibilityRole="button" onPress={openPreview}><Text style={styles.contractCreateText}>＋ Thêm xe</Text></Pressable>
          : <Text style={styles.permissionNote}>Bạn có quyền xem đội xe nhưng chưa được cấp quyền thêm / sửa thông tin xe.</Text>
          : null}
      <View style={[styles.listPanel, { height: Math.round(height * 0.47) }]}>
        <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Tra cứu</Text><Text style={styles.sectionHint}>Vuốt để xem danh sách</Text></View>
        <RecordList kind={kind} title={config.title} embedded onSnapshot={onSnapshot} refreshKey={refreshKey}
          onEditDraft={kind === 'contracts' && can(user, 'contracts.draft') ? openDraft : undefined}
          onDeleteDraft={kind === 'contracts' && can(user, 'contracts.draft') ? removeDraft : undefined}
          onEditVehicle={kind === 'vehicles' && can(user, 'vehicles.write') ? openVehicle : undefined}
          onEditCustomer={kind === 'customers' && can(user, 'customers.write') ? openCustomer : undefined}
          onDeleteCustomer={kind === 'customers' && can(user, 'customers.write') ? removeCustomer : undefined} />
      </View>
      <View style={styles.belowContent}>
      <Text style={styles.sectionTitle}>Tổng quan</Text>
      <View style={styles.totalCard}>
        <View><Text style={styles.totalLabel}>Kết quả hiện tại</Text><Text style={styles.totalNote}>Theo tìm kiếm trong danh sách</Text></View>
        <Text style={styles.totalValue}>{snapshot?.total ?? '—'}</Text>
      </View>
      {snapshot ? <><Text style={styles.sampleNote}>Trong {snapshot.items.length} mục đã tải</Text>
        <View style={styles.metricRow}>{metrics.map(metric => <View key={metric.label} style={styles.metricCard}><Text style={styles.metricValue}>{metric.value}</Text><Text style={styles.metricLabel}>{metric.label}</Text></View>)}</View>
      </> : null}
      {kind === 'customers' && can(user, 'vehicles.read') ? <Pressable style={styles.actionCard} accessibilityRole="button" onPress={() => router.push('/gps')}>
        <View style={styles.actionText}><Text style={styles.actionTitle}>Định vị GPS</Text><Text style={styles.actionDetail}>Tìm xe, xem trạng thái thiết bị và mở vị trí trên bản đồ.</Text></View><Text style={styles.arrow}>›</Text>
      </Pressable> : null}
      {kind !== 'contracts' && kind !== 'vehicles' && can(user, config.permission) ? <View style={styles.actionSection}>
        <Text style={styles.sectionTitle}>Thao tác nhanh</Text>
        <Pressable style={styles.actionCard} accessibilityRole="button" onPress={openPreview}>
          <View style={styles.actionText}><Text style={styles.actionTitle}>{config.action}</Text><Text style={styles.actionDetail}>{kind === 'customers' ? 'Tạo hồ sơ khách hàng mới' : 'Xem trước giao diện nhập thông tin'}</Text></View>
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      </View> : null}
      </View>
    </ScrollView>
    <Modal visible={previewOpen} animationType="slide" onRequestClose={closePreview} presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalRoot} edges={['top', 'left', 'right', 'bottom']}>
        <KeyboardAvoidingView style={styles.modalBody} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>{kind === 'vehicles' && editingVehicleId ? 'Sửa thông tin xe' : config.action}</Text><Pressable accessibilityRole="button" onPress={closePreview}><Text style={styles.close}>Đóng</Text></Pressable></View>
            <Text style={styles.previewNotice}>{kind === 'customers' ? 'Hồ sơ sẽ được lưu vào cơ sở đã chọn. Kiểm tra kỹ thông tin trước khi lưu.' : kind === 'contracts' ? 'Bản nháp chưa phát hành. Có thể cập nhật hoặc xóa khi cần; việc phát hành hợp đồng là quy trình riêng.' : kind === 'vehicles' ? 'Thông tin xe được lưu trực tiếp vào đội xe. Thay đổi trạng thái hoặc cơ sở có thể bị từ chối nếu xe đang thuộc hợp đồng hoặc chờ luân chuyển.' : ''}</Text>
            {kind === 'contracts' ? <>
              {loadingDraft ? <Text style={styles.formHint}>Đang tải dữ liệu bản nháp…</Text> : null}
              {contractEdits ? <>
                <Text style={styles.fieldLabel}>Cơ sở ghi nhận *</Text>
                {stores.map(store => <Pressable key={store.id} style={[styles.storeChoice, String(contractEdits.draft.store_id || '') === String(store.id) && styles.storeChoiceSelected]} onPress={() => setContractEdits(current => current ? { ...current, draft: { ...current.draft, store_id: String(store.id), vehicle_store_id: String(store.id) } } : current)}><Text style={styles.storeChoiceText}>{store.name}</Text></Pressable>)}
                <Text style={styles.fieldLabel}>Loại hợp đồng</Text>
                <View style={styles.choiceRow}>{[{ value: 'daily', label: 'Theo ngày' }, { value: 'monthly', label: 'Theo tháng' }, { value: 'ownership', label: 'Thuê sở hữu' }].map(option => <Pressable key={option.value} style={[styles.typeChoice, contractEdits.rental_type === option.value && styles.storeChoiceSelected]} onPress={() => setContractEdits(current => current ? { ...current, rental_type: option.value, draft: { ...current.draft, package_name: option.value === 'daily' ? 'Theo ngày' : 'Theo tháng' } } : current)}><Text style={styles.storeChoiceText}>{option.label}</Text></Pressable>)}</View>
                <Text style={styles.fieldLabel}>Số hợp đồng (nếu đã có)</Text><TextInput style={styles.fieldInput} value={String(contractEdits.draft.contract_number || '')} placeholder="Để trống để cấp mã nháp" onChangeText={value => updateContractDraft('contract_number', value)} />
                <Text style={styles.fieldLabel}>Khách hàng</Text><TextInput style={styles.fieldInput} value={String((contractEdits.draft.customer as Record<string, unknown>)?.name || '')} placeholder="Họ và tên khách hàng" onChangeText={value => updateContractCustomer('name', value)} />
                <Text style={styles.fieldLabel}>Số điện thoại</Text><TextInput style={styles.fieldInput} value={String((contractEdits.draft.customer as Record<string, unknown>)?.phone || '')} keyboardType="phone-pad" placeholder="Số điện thoại" onChangeText={value => updateContractCustomer('phone', value)} />
                <Text style={styles.fieldLabel}>CCCD / giấy tờ</Text><TextInput style={styles.fieldInput} value={String((contractEdits.draft.customer as Record<string, unknown>)?.id_card || '')} placeholder="Số giấy tờ khách hàng" onChangeText={value => updateContractCustomer('id_card', value)} />
                <Text style={styles.fieldLabel}>Địa chỉ</Text><TextInput style={styles.fieldInput} value={String((contractEdits.draft.customer as Record<string, unknown>)?.address || '')} placeholder="Địa chỉ khách hàng" onChangeText={value => updateContractCustomer('address', value)} />
                <Text style={styles.fieldLabel}>Tên xe dự kiến</Text><TextInput style={styles.fieldInput} value={String(((contractEdits.draft.vehicles as Record<string, unknown>[])[0] || {}).name || '')} placeholder="Ví dụ: Honda Vision" onChangeText={value => updateContractVehicle('name', value)} />
                <Text style={styles.fieldLabel}>Biển số xe</Text><TextInput style={styles.fieldInput} value={String(((contractEdits.draft.vehicles as Record<string, unknown>[])[0] || {}).license || '')} placeholder="Biển số (có thể bổ sung sau)" onChangeText={value => updateContractVehicle('license', value)} />
                <Text style={styles.fieldLabel}>Bắt đầu · YYYY-MM-DDTHH:mm</Text><TextInput style={styles.fieldInput} value={String(contractEdits.draft.start_date || '')} placeholder="2026-10-26T08:00" onChangeText={value => updateContractDraft('start_date', value)} />
                <Text style={styles.fieldLabel}>Dự kiến trả · YYYY-MM-DDTHH:mm</Text><TextInput style={styles.fieldInput} value={String(contractEdits.draft.end_date || '')} placeholder="2026-10-27T08:00" onChangeText={value => updateContractDraft('end_date', value)} />
                <Text style={styles.fieldLabel}>Ghi chú</Text><TextInput style={[styles.fieldInput, styles.notesInput]} value={contractEdits.notes} multiline onChangeText={value => setContractEdits(current => current ? { ...current, notes: value } : current)} />
              </> : null}
              {storeError ? <Text style={styles.formError}>{storeError}</Text> : null}
              {saveError ? <Text style={styles.formError}>{saveError}</Text> : null}
              <Pressable style={[styles.saveButton, (saving || loadingDraft || !contractEdits || !stores.length) && styles.saveButtonDisabled]} accessibilityRole="button" disabled={saving || loadingDraft || !contractEdits || !stores.length} onPress={() => void saveContractDraft()}><Text style={styles.saveButtonText}>{saving ? 'Đang lưu…' : editingDraftId ? 'Lưu bản nháp' : 'Tạo bản nháp'}</Text></Pressable>
            </> : kind === 'vehicles' ? <>
              {loadingDraft ? <Text style={styles.formHint}>Đang tải thông tin xe…</Text> : null}
              {vehicleEdits ? <>
                <Text style={styles.fieldLabel}>Tên / dòng xe *</Text><TextInput style={styles.fieldInput} value={vehicleEdits.name} placeholder="Ví dụ: Vision 110" onChangeText={value => updateVehicleField('name', value)} />
                <Text style={styles.fieldLabel}>Biển số *</Text><TextInput style={styles.fieldInput} value={vehicleEdits.license} autoCapitalize="characters" placeholder="Ví dụ: 59A1-12345" onChangeText={value => updateVehicleField('license', value)} />
                <Text style={styles.fieldLabel}>Hãng xe *</Text><TextInput style={styles.fieldInput} value={vehicleEdits.brand} placeholder="Ví dụ: Honda" onChangeText={value => updateVehicleField('brand', value)} />
                <Text style={styles.fieldLabel}>Loại xe *</Text><View style={styles.choiceRow}>{vehicleTypes.map(option => <Pressable key={option.value} style={[styles.typeChoice, vehicleEdits.type === option.value && styles.storeChoiceSelected]} accessibilityRole="radio" accessibilityState={{ checked: vehicleEdits.type === option.value }} onPress={() => updateVehicleField('type', option.value)}><Text style={styles.storeChoiceText}>{option.label}</Text></Pressable>)}</View>
                <Text style={styles.fieldLabel}>Năm sản xuất *</Text><TextInput style={styles.fieldInput} value={vehicleEdits.year} keyboardType="numeric" placeholder="YYYY" onChangeText={value => updateVehicleField('year', value)} />
                <Text style={styles.fieldLabel}>Cơ sở hiện tại *</Text>{stores.map(store => <Pressable key={store.id} style={[styles.storeChoice, vehicleEdits.store_id === String(store.id) && styles.storeChoiceSelected]} accessibilityRole="radio" accessibilityState={{ checked: vehicleEdits.store_id === String(store.id) }} onPress={() => updateVehicleField('store_id', String(store.id))}><Text style={styles.storeChoiceText}>{store.name}</Text></Pressable>)}
                <Text style={styles.fieldLabel}>Trạng thái *</Text><View style={styles.choiceRow}>{vehicleStatuses.map(option => <Pressable key={option.value} style={[styles.typeChoice, vehicleEdits.status === option.value && styles.storeChoiceSelected]} accessibilityRole="radio" accessibilityState={{ checked: vehicleEdits.status === option.value }} onPress={() => updateVehicleField('status', option.value)}><Text style={styles.storeChoiceText}>{option.label}</Text></Pressable>)}</View>
                <Text style={styles.fieldLabel}>Màu sắc</Text><TextInput style={styles.fieldInput} value={vehicleEdits.color} placeholder="Ví dụ: Đen nhám" onChangeText={value => updateVehicleField('color', value)} />
                <Text style={styles.fieldLabel}>Số km</Text><TextInput style={styles.fieldInput} value={vehicleEdits.odometer} keyboardType="numeric" placeholder="Số km hiện tại" onChangeText={value => updateVehicleField('odometer', value)} />
                <Text style={styles.fieldLabel}>Số khung</Text><TextInput style={styles.fieldInput} value={vehicleEdits.chassis} placeholder="Số khung xe" onChangeText={value => updateVehicleField('chassis', value)} />
                <Text style={styles.fieldLabel}>Số máy</Text><TextInput style={styles.fieldInput} value={vehicleEdits.engine} placeholder="Số máy xe" onChangeText={value => updateVehicleField('engine', value)} />
                <Text style={styles.fieldLabel}>Ghi chú</Text><TextInput style={[styles.fieldInput, styles.notesInput]} value={vehicleEdits.note} multiline placeholder="Thông tin bổ sung" onChangeText={value => updateVehicleField('note', value)} />
              </> : null}
              {storeError ? <Text style={styles.formError}>{storeError}</Text> : null}
              {saveError ? <Text style={styles.formError}>{saveError}</Text> : null}
              <Pressable style={[styles.saveButton, (saving || loadingDraft || !vehicleEdits || !stores.length) && styles.saveButtonDisabled]} accessibilityRole="button" disabled={saving || loadingDraft || !vehicleEdits || !stores.length} onPress={() => void saveVehicle()}><Text style={styles.saveButtonText}>{saving ? 'Đang lưu…' : editingVehicleId ? 'Lưu thay đổi' : 'Thêm xe vào đội xe'}</Text></Pressable>
            </> : <>
              {kind === 'customers' ? <>
                {[{key:'name',label:'Họ và tên',placeholder:'Tên khách hàng'}, {key:'phone',label:'Số điện thoại',placeholder:'Số điện thoại',keyboard:'phone-pad' as const}, {key:'email',label:'Email',placeholder:'Email (không bắt buộc)'}, {key:'idCard',label:'CCCD / CMND',placeholder:'Giấy tờ định danh'}, {key:'address',label:'Địa chỉ',placeholder:'Địa chỉ hiện tại'}].map(field => <View key={field.key} style={styles.field}><Text style={styles.fieldLabel}>{field.label}{field.key !== 'email' ? ' *' : ''}</Text><TextInput style={styles.fieldInput} placeholder={field.placeholder} value={draft[field.key] || ''} keyboardType={field.keyboard || 'default'} onChangeText={value => setDraft(previous => ({ ...previous, [field.key]: value }))} /></View>)}
              </> : config.fields.map(field => <View key={field.key} style={styles.field}><Text style={styles.fieldLabel}>{field.label}{kind === 'customers' ? ' *' : ''}</Text><TextInput style={styles.fieldInput} placeholder={field.placeholder} value={draft[field.key] || ''} keyboardType={field.keyboard || 'default'} onChangeText={value => setDraft(previous => ({ ...previous, [field.key]: value }))} /></View>)}
            </>}
            {kind === 'customers' && !editingCustomerId ? <>
              <Text style={styles.fieldLabel}>Cơ sở nguồn khách *</Text>
              {storeError ? <Text style={styles.formError}>{storeError}</Text> : null}
              {stores.map(store => <Pressable key={store.id} style={[styles.storeChoice, storeId === store.id && styles.storeChoiceSelected]} accessibilityRole="radio" accessibilityState={{ checked: storeId === store.id }} onPress={() => setStoreId(store.id)}><Text style={styles.storeChoiceText}>{store.name}</Text></Pressable>)}
              {saveError ? <Text style={styles.formError}>{saveError}</Text> : null}
              {saveError ? <Text style={styles.formError}>{saveError}</Text> : null}
              <Pressable style={[styles.saveButton, (saving || loadingDraft || !storeId && !editingCustomerId) && styles.saveButtonDisabled]} accessibilityRole="button" disabled={saving || loadingDraft || !storeId && !editingCustomerId} onPress={() => void saveCustomer()}><Text style={styles.saveButtonText}>{saving ? 'Đang lưu…' : editingCustomerId ? 'Lưu thay đổi' : 'Lưu khách hàng'}</Text></Pressable>
            </> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
    {workflowMode ? <ContractWorkflows mode={workflowMode} user={user} onClose={() => setWorkflowMode(null)} onDone={() => { setWorkflowMode(null); setRefreshKey(value => value + 1); }} /> : null}
    {returnWorkflowOpen ? <ContractReturnWorkflow onClose={() => setReturnWorkflowOpen(false)} onDone={() => { setReturnWorkflowOpen(false); setRefreshKey(value => value + 1); }} /> : null}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafa' },
  page: { flex: 1 }, pageContent: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 28 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.7, color: '#171717', marginBottom: 18 },
  contractCreateButton: { backgroundColor: '#e3262e', borderRadius: 14, minHeight: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  contractCreateText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  secondaryWorkflowButton: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e3262e' }, secondaryWorkflowText: { color: '#e3262e', fontSize: 15, fontWeight: '800' },
  permissionNote: { color: '#737373', fontSize: 13, lineHeight: 19, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#ececec', borderRadius: 13, padding: 13, marginBottom: 14 },
  listPanel: { backgroundColor: '#ffffff', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#ececec', shadowColor: '#171717', shadowOpacity: 0.045, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: '#171717', fontSize: 18, fontWeight: '800' },
  sectionHint: { color: '#737373', fontSize: 12 },
  belowContent: { paddingTop: 22 },
  totalCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, padding: 18, backgroundColor: '#fff5f5', borderRadius: 16, borderLeftWidth: 3, borderLeftColor: '#e3262e' },
  totalLabel: { color: '#171717', fontSize: 15, fontWeight: '700' }, totalNote: { color: '#737373', fontSize: 12, marginTop: 5 },
  totalValue: { color: '#e3262e', fontSize: 30, fontWeight: '800' },
  sampleNote: { color: '#737373', fontSize: 12, marginTop: 17, marginBottom: 9 },
  metricRow: { flexDirection: 'row', gap: 10 }, metricCard: { flex: 1, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#ececec', borderRadius: 14, padding: 16 },
  metricValue: { color: '#171717', fontSize: 24, fontWeight: '800' }, metricLabel: { color: '#737373', fontSize: 12, marginTop: 4 },
  actionSection: { marginTop: 24 }, actionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#ececec', borderRadius: 16, padding: 18, marginTop: 12 },
  actionText: { flex: 1 }, actionTitle: { color: '#171717', fontSize: 16, fontWeight: '700' }, actionDetail: { color: '#737373', fontSize: 13, marginTop: 5 }, arrow: { color: '#e3262e', fontSize: 30, marginLeft: 8 },
  modalRoot: { flex: 1, backgroundColor: '#fafafa' }, modalBody: { flex: 1 }, modalContent: { padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, modalTitle: { color: '#171717', fontSize: 26, fontWeight: '800', flex: 1 }, close: { color: '#e3262e', fontSize: 15, fontWeight: '700', marginLeft: 12 },
  previewNotice: { color: '#737373', fontSize: 14, lineHeight: 21, marginTop: 16, marginBottom: 20 },
  field: { marginBottom: 16 }, fieldLabel: { color: '#171717', fontSize: 14, fontWeight: '700', marginTop: 14, marginBottom: 8 },
  fieldInput: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d6d6d6', borderRadius: 14, height: 52, paddingHorizontal: 16, color: '#171717', fontSize: 16 },
  notesInput: { minHeight: 90, paddingTop: 13, textAlignVertical: 'top' }, formHint: { color: '#737373', fontSize: 14, marginVertical: 12 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, typeChoice: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d6d6d6', borderRadius: 13, padding: 12 },
  storeChoice: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d6d6d6', borderRadius: 13, padding: 14, marginTop: 8 },
  storeChoiceSelected: { borderColor: '#e3262e', backgroundColor: '#fff5f5' }, storeChoiceText: { color: '#171717', fontSize: 15, fontWeight: '600' },
  formError: { color: '#8f1414', fontSize: 13, marginTop: 12 },
  saveButton: { backgroundColor: '#e3262e', borderRadius: 13, alignItems: 'center', padding: 16, marginTop: 20 },
  saveButtonDisabled: { opacity: 0.55 }, saveButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  disabledSave: { backgroundColor: '#ececec', borderRadius: 13, alignItems: 'center', padding: 16, marginTop: 10 }, disabledSaveText: { color: '#737373', fontSize: 15, fontWeight: '700' },
});
