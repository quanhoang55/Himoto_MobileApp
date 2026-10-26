import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { apiGet } from '../core/api';
import type { FinanceSummary as FinanceSummaryData } from '../core/models';

const money = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' });
const formatDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return date.format(new Date(year, month - 1, day));
};

export function FinanceSummary() {
  const [summary, setSummary] = useState<FinanceSummaryData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setSummary(await apiGet<FinanceSummaryData>('/finance/summary')); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được tổng quan tài chính.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <View style={styles.card}>
    <View style={styles.headingRow}>
      <View><Text style={styles.kicker}>TÀI CHÍNH</Text><Text style={styles.title}>Tổng quan tháng này</Text></View>
      {loading ? <ActivityIndicator color="#e3262e" /> : null}
    </View>
    {summary ? <>
      <Text style={styles.period}>{formatDate(summary.period.from)} – {formatDate(summary.period.to)}</Text>
      <View style={styles.revenueBox}>
        <Text style={styles.metricLabel}>Doanh thu thuê xe</Text>
        <Text style={styles.revenue}>{money.format(summary.revenue)} ₫</Text>
        <Text style={styles.caption}>Theo tiền thuê đã thu và hoàn thực tế</Text>
      </View>
      <View style={styles.row}>
        <View style={styles.smallMetric}><Text style={styles.metricLabel}>Tổng thu</Text><Text style={styles.value}>{money.format(summary.income)} ₫</Text><Text style={styles.caption}>{summary.incomeCount} phiếu thu</Text></View>
        <View style={styles.smallMetric}><Text style={styles.metricLabel}>Tổng chi</Text><Text style={styles.value}>{money.format(summary.expense)} ₫</Text><Text style={styles.caption}>{summary.expenseCount} phiếu chi</Text></View>
      </View>
    </> : null}
    {error ? <Pressable accessibilityRole="button" onPress={() => void load()}><Text style={styles.error}>{error} · Chạm để thử lại</Text></Pressable> : null}
    {!summary && loading ? <Text style={styles.caption}>Đang tải số liệu thu chi…</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#ffffff', borderRadius: 18, padding: 20, marginBottom: 14, borderWidth: 1, borderColor: '#ececec', shadowColor: '#171717', shadowOpacity: 0.045, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { color: '#e3262e', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { color: '#171717', fontSize: 19, fontWeight: '800', marginTop: 5 },
  period: { color: '#737373', fontSize: 13, marginTop: 5, marginBottom: 16 },
  revenueBox: { backgroundColor: '#fff5f5', borderRadius: 14, padding: 16, borderLeftWidth: 3, borderLeftColor: '#e3262e' },
  metricLabel: { color: '#737373', fontSize: 13, fontWeight: '600' },
  revenue: { color: '#e3262e', fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginTop: 7 },
  caption: { color: '#737373', fontSize: 12, marginTop: 6 },
  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  smallMetric: { flex: 1, backgroundColor: '#fafafa', borderRadius: 13, padding: 14 },
  value: { color: '#171717', fontSize: 17, fontWeight: '800', marginTop: 8 },
  error: { color: '#8f1414', fontSize: 13, marginTop: 14 },
});
