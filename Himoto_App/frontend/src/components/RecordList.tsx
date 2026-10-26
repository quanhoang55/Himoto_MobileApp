import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiGet } from '../core/api';
import type { ListResult, RecordItem } from '../core/models';

type Kind = 'contracts' | 'customers' | 'vehicles' | 'staff';
export type RecordSnapshot = { total: number; items: RecordItem[] };
export function RecordList({ kind, title, embedded = false, onSnapshot, refreshKey = 0, onEditDraft, onDeleteDraft, onEditVehicle, onEditCustomer, onDeleteCustomer }: { kind: Kind; title: string; embedded?: boolean; onSnapshot?: (snapshot: RecordSnapshot) => void; refreshKey?: number; onEditDraft?: (item: RecordItem) => void; onDeleteDraft?: (item: RecordItem) => void; onEditVehicle?: (item: RecordItem) => void; onEditCustomer?: (item: RecordItem) => void; onDeleteCustomer?: (item: RecordItem) => void }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [items, setItems] = useState<RecordItem[]>([]);
  const itemsRef = useRef<RecordItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async (nextPage: number) => {
    setBusy(true); setError('');
    try {
      const query = new URLSearchParams({ page: String(nextPage), size: '20' });
      if (term) query.set('search', term);
      const result = await apiGet<ListResult<RecordItem>>(`/${kind}?${query}`);
      const nextItems = nextPage === 1 ? result.items : [...itemsRef.current, ...result.items];
      itemsRef.current = nextItems;
      setItems(nextItems);
      onSnapshot?.({ total: result.total, items: nextItems });
      setPage(nextPage); setHasMore(result.hasMore);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được dữ liệu.'); }
    finally { setBusy(false); }
  }, [kind, term, onSnapshot]);
  useEffect(() => { void load(1); }, [load, refreshKey]);
  const row = (item: RecordItem) => <View key={item.id}>
    <Pressable style={styles.card} disabled={kind === 'staff'} onPress={() => router.push(`/${kind}/${item.id}`)}>
      <Text style={styles.name}>{item.code || item.license || item.name}</Text>
      {item.code || item.license ? <Text style={styles.secondary}>{item.customerName || item.name}</Text> : null}
      {kind === 'customers' && item.phone ? <Text style={styles.secondary}>{item.phone}{item.contractCount ? ` · ${item.contractCount} hợp đồng` : ''}</Text> : null}
      {kind === 'staff' && item.position ? <Text style={styles.secondary}>{item.position}</Text> : null}
      <Text style={styles.secondary}>{item.storeName || 'Chưa có cơ sở'} · {item.status}</Text>
    </Pressable>
    {kind === 'contracts' && item.status === 'draft' && (onEditDraft || onDeleteDraft) ? <View style={styles.draftActions}>
      {onEditDraft ? <Pressable accessibilityRole="button" style={styles.draftEdit} onPress={() => onEditDraft(item)}><Text style={styles.draftEditText}>Sửa nháp</Text></Pressable> : null}
      {onDeleteDraft ? <Pressable accessibilityRole="button" style={styles.draftDelete} onPress={() => onDeleteDraft(item)}><Text style={styles.draftDeleteText}>Xóa nháp</Text></Pressable> : null}
    </View> : null}
    {kind === 'vehicles' && onEditVehicle ? <View style={styles.draftActions}><Pressable accessibilityRole="button" style={styles.draftEdit} onPress={() => onEditVehicle(item)}><Text style={styles.draftEditText}>Sửa xe</Text></Pressable></View> : null}
    {kind === 'customers' && (onEditCustomer || onDeleteCustomer) ? <View style={styles.draftActions}>
      {onEditCustomer ? <Pressable accessibilityRole="button" style={styles.draftEdit} onPress={() => onEditCustomer(item)}><Text style={styles.draftEditText}>Sửa hồ sơ</Text></Pressable> : null}
      {onDeleteCustomer ? <Pressable accessibilityRole="button" style={styles.draftDelete} onPress={() => onDeleteCustomer(item)}><Text style={styles.draftDeleteText}>Xóa khách</Text></Pressable> : null}
    </View> : null}
  </View>;
  const footer = hasMore ? <Pressable disabled={busy} style={styles.more} onPress={() => void load(page + 1)}>{busy ? <ActivityIndicator /> : <Text>Xem thêm</Text>}</Pressable> : null;
  const content = <>
    {!embedded ? <Text style={styles.title}>{title}</Text> : null}
    <View style={styles.searchRow}><TextInput style={styles.input} placeholder="Tìm kiếm" value={search} onChangeText={setSearch} onSubmitEditing={() => setTerm(search.trim())} returnKeyType="search" />
      <Pressable style={styles.searchButton} onPress={() => setTerm(search.trim())}><Text style={styles.searchText}>Tìm</Text></Pressable></View>
    {error ? <Pressable onPress={() => void load(page)}><Text style={styles.error}>{error} · Thử lại</Text></Pressable> : null}
    {embedded ? <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={busy && page === 1} onRefresh={() => void load(1)} />}>
      {items.map(row)}
      {!items.length && !busy ? <Text style={styles.empty}>Không có dữ liệu.</Text> : null}
      {footer}
    </ScrollView> : <FlatList style={styles.list} data={items} keyExtractor={item => String(item.id)} onRefresh={() => void load(1)} refreshing={busy && page === 1}
      ListEmptyComponent={!busy ? <Text style={styles.empty}>Không có dữ liệu.</Text> : null}
      renderItem={({ item }) => row(item)}
      ListFooterComponent={footer} />}
  </>;
  return embedded ? <View style={styles.embeddedRoot}>{content}</View> : <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>{content}</SafeAreaView>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#fafafa', paddingHorizontal: 20, paddingTop: 22 }, title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.7, color: '#171717', marginBottom: 20 },
  embeddedRoot: { flex: 1, minHeight: 0 },
  list: { flex: 1 },
  searchRow: { flexDirection: 'row', gap: 10, marginBottom: 18 }, input: { flex: 1, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d6d6d6', borderRadius: 14, paddingHorizontal: 16, height: 52, fontSize: 16, color: '#171717' },
  searchButton: { backgroundColor: '#e3262e', paddingHorizontal: 20, justifyContent: 'center', borderRadius: 14 }, searchText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  card: { backgroundColor: '#ffffff', padding: 18, borderRadius: 16, marginBottom: 7, borderWidth: 1, borderColor: '#ececec', shadowColor: '#171717', shadowOpacity: 0.045, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 }, name: { color: '#171717', fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
  draftActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: -1, marginBottom: 12 }, draftEdit: { borderWidth: 1, borderColor: '#e3262e', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 13 }, draftEditText: { color: '#e3262e', fontSize: 13, fontWeight: '700' }, draftDelete: { borderWidth: 1, borderColor: '#ececec', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 13 }, draftDeleteText: { color: '#737373', fontSize: 13, fontWeight: '700' },
  secondary: { color: '#737373', marginTop: 7, fontSize: 14 }, error: { color: '#8f1414', marginBottom: 12, fontSize: 14 }, empty: { color: '#737373', textAlign: 'center', marginTop: 30 }, more: { padding: 16, alignItems: 'center' } });
