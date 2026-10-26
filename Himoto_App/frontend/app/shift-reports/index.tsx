import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiGet } from '../../src/core/api';

type ShiftReport = { id: number; date: string; status: string; storeName: string };
const statusLabel = (status: string) => status === 'submitted' ? 'Đã gửi' : status === 'draft' ? 'Bản nháp' : status || 'Chưa rõ';
const dateLabel = (value: string) => value.split('-').reverse().join('/');

export default function ShiftReports() {
  const [items, setItems] = useState<ShiftReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems((await apiGet<{ items: ShiftReport[] }>('/shift-reports')).items); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được báo cáo cuối ca.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}>
    <Text style={styles.title}>Báo cáo cuối ca</Text>
    <Text style={styles.subtitle}>50 báo cáo gần nhất trong phạm vi được phép xem</Text>
    <View style={styles.summary}><View><Text style={styles.summaryLabel}>Báo cáo hiển thị</Text><Text style={styles.summaryNote}>Vuốt xuống để cập nhật</Text></View><Text style={styles.summaryValue}>{loading && !items.length ? '—' : items.length}</Text></View>
    {loading && !items.length ? <ActivityIndicator color="#e3262e" /> : null}
    {error ? <Pressable onPress={() => void load()}><Text style={styles.error}>{error} · Chạm để thử lại</Text></Pressable> : null}
    {!loading && !error && !items.length ? <Text style={styles.empty}>Chưa có báo cáo cuối ca.</Text> : null}
    {items.map(item => <View key={item.id} style={styles.card}>
      <View style={styles.cardRow}><Text style={styles.name}>{dateLabel(item.date)}</Text><Text style={styles.status}>{statusLabel(item.status)}</Text></View>
      <Text style={styles.detail}>{item.storeName}</Text>
    </View>)}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafa' }, content: { padding: 20, paddingTop: 28, paddingBottom: 36 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.7, color: '#171717' }, subtitle: { color: '#737373', fontSize: 14, marginTop: 7, marginBottom: 20 },
  summary: { backgroundColor: '#fff5f5', borderRadius: 16, borderLeftWidth: 3, borderLeftColor: '#e3262e', padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  summaryLabel: { color: '#171717', fontSize: 15, fontWeight: '700' }, summaryNote: { color: '#737373', fontSize: 12, marginTop: 5 }, summaryValue: { color: '#e3262e', fontSize: 27, fontWeight: '800' },
  card: { backgroundColor: '#ffffff', borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: '#ececec' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, name: { color: '#171717', fontSize: 17, fontWeight: '700' },
  status: { color: '#e3262e', fontSize: 12, fontWeight: '700' }, detail: { color: '#737373', fontSize: 13, marginTop: 7 },
  error: { color: '#8f1414', marginVertical: 12 }, empty: { color: '#737373', textAlign: 'center', marginTop: 22 },
});
