import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiGet } from '../../src/core/api';

type Store = { id: number; name: string };

export default function Stores() {
  const [stores, setStores] = useState<Store[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setStores((await apiGet<{ stores: Store[] }>('/bootstrap')).stores); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được danh bạ cơ sở.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const visible = stores.filter(store => store.name.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')));

  return <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Danh bạ cơ sở</Text>
    <Text style={styles.subtitle}>Các cơ sở đang hoạt động trong hệ thống</Text>
    <TextInput style={styles.search} placeholder="Tìm cơ sở" value={search} onChangeText={setSearch} />
    <View style={styles.summary}><Text style={styles.summaryLabel}>Cơ sở hiển thị</Text><Text style={styles.summaryValue}>{loading ? '—' : visible.length}</Text></View>
    {loading ? <ActivityIndicator color="#e3262e" /> : null}
    {error ? <Pressable onPress={() => void load()}><Text style={styles.error}>{error} · Chạm để thử lại</Text></Pressable> : null}
    {!loading && !error && !visible.length ? <Text style={styles.empty}>Không tìm thấy cơ sở.</Text> : null}
    {visible.map(store => <View key={store.id} style={styles.card}><Text style={styles.name}>{store.name}</Text><Text style={styles.detail}>Mã cơ sở #{store.id}</Text></View>)}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafa' }, content: { padding: 20, paddingTop: 28, paddingBottom: 36 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.7, color: '#171717' }, subtitle: { color: '#737373', fontSize: 14, marginTop: 7, marginBottom: 20 },
  search: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d6d6d6', borderRadius: 14, paddingHorizontal: 16, height: 52, fontSize: 16, color: '#171717', marginBottom: 14 },
  summary: { backgroundColor: '#fff5f5', borderRadius: 16, borderLeftWidth: 3, borderLeftColor: '#e3262e', padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  summaryLabel: { color: '#171717', fontSize: 15, fontWeight: '700' }, summaryValue: { color: '#e3262e', fontSize: 27, fontWeight: '800' },
  card: { backgroundColor: '#ffffff', borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: '#ececec' },
  name: { color: '#171717', fontSize: 17, fontWeight: '700' }, detail: { color: '#737373', fontSize: 13, marginTop: 7 },
  error: { color: '#8f1414', marginVertical: 12 }, empty: { color: '#737373', textAlign: 'center', marginTop: 22 },
});
