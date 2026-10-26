import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiGet } from '../../../src/core/api';
import type { ContractHistory } from '../../../src/core/models';

const money = (value: number) => new Intl.NumberFormat('vi-VN').format(value) + ' ₫';
const date = (value: string) => value ? new Date(value).toLocaleString('vi-VN') : '—';

export default function ContractHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [history, setHistory] = useState<ContractHistory | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!id) return;
    setError('');
    try { setHistory(await apiGet<ContractHistory>(`/contracts/${encodeURIComponent(id)}/history`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được lịch sử.'); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  return <SafeAreaView style={styles.root} edges={['top', 'right', 'bottom', 'left']}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>Lịch sử hợp đồng</Text>
    {error ? <Pressable onPress={() => void load()}><Text style={styles.error}>{error} · Thử lại</Text></Pressable> : null}
    {!history && !error ? <ActivityIndicator /> : null}
    {history ? <>
      <Text style={styles.heading}>Thay đổi ({history.changes.length})</Text>
      {history.changes.length === 0 ? <Text style={styles.muted}>Chưa có thay đổi.</Text> : history.changes.map(change => <View key={change.id} style={styles.card}>
        <Text style={styles.name}>{change.title}</Text><Text style={styles.muted}>{date(change.at)} · {change.actor}</Text>
        {change.detail ? <Text style={styles.body}>{change.detail}</Text> : null}
        {change.amount != null ? <Text style={styles.body}>{money(change.amount)}</Text> : null}
      </View>)}
      <Text style={styles.heading}>Thu chi ({history.cashflow.length})</Text>
      {history.cashflow.length === 0 ? <Text style={styles.muted}>Chưa có giao dịch.</Text> : history.cashflow.map(item => <View key={item.id} style={styles.card}>
        <Text style={styles.name}>{item.reason}</Text><Text style={styles.body}>{item.type === 'expense' ? '−' : '+'}{money(item.amount)} · {item.status}</Text>
        <Text style={styles.muted}>{date(item.at)} · {item.method}</Text>
        {item.note ? <Text style={styles.body}>{item.note}</Text> : null}
      </View>)}
    </> : null}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#fafafa' }, content: { padding: 20, paddingTop: 28, paddingBottom: 40 }, title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.7, color: '#171717' }, heading: { fontSize: 19, fontWeight: '700', color: '#171717', marginTop: 24, marginBottom: 12 }, card: { backgroundColor: '#ffffff', padding: 18, borderRadius: 16, marginBottom: 11, borderWidth: 1, borderColor: '#ececec', shadowColor: '#171717', shadowOpacity: 0.045, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 1 }, name: { fontSize: 16, fontWeight: '700', color: '#171717' }, body: { color: '#404040', marginTop: 7, lineHeight: 21 }, muted: { color: '#737373', marginTop: 6, fontSize: 13 }, error: { color: '#8f1414', marginTop: 14 } });
