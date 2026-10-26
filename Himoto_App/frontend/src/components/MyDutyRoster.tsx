import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { apiGet } from '../core/api';
import type { MyDutyRoster as MyDutyRosterData } from '../core/models';

const vietnamDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};
const dayLabel = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(`${value}T00:00:00+07:00`));
const addDays = (value: string, days: number) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const timeLabel = (value: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)) : 'Chưa có giờ';

export function MyDutyRoster() {
  const [data, setData] = useState<MyDutyRosterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await apiGet<MyDutyRosterData>('/me/duty-roster')); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được lịch trực của bạn.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const today = vietnamDate(new Date());

  return <View style={styles.card}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>LỊCH TRỰC CÁ NHÂN</Text><Text style={styles.title}>Ca trực tuần này</Text>{data ? <Text style={styles.period}>{dayLabel(data.week)} – {dayLabel(addDays(data.week, 6))}</Text> : null}</View><Pressable accessibilityRole="button" onPress={() => void load()} disabled={loading}><Text style={styles.refresh}>{loading ? '…' : 'Làm mới'}</Text></Pressable></View>
    {loading && !data ? <ActivityIndicator style={styles.loader} color="#e3262e" /> : null}
    {error ? <Pressable accessibilityRole="button" onPress={() => void load()}><Text style={styles.error}>{error} · Chạm để thử lại</Text></Pressable> : null}
    {data && !data.linked ? <Text style={styles.empty}>Tài khoản của bạn chưa liên kết với hồ sơ nhân sự.</Text> : null}
    {data?.linked && !data.items.length ? <Text style={styles.empty}>Chưa có ca trực được phân công trong tuần này.</Text> : null}
    {data?.items.slice(0, 4).map(item => <View key={item.id} style={[styles.shift, item.date === today && styles.today]}>
      <View style={styles.dateColumn}><Text style={styles.day}>{dayLabel(item.date)}</Text><Text style={styles.hours}>{item.startsAt && item.endsAt ? `${timeLabel(item.startsAt)} – ${timeLabel(item.endsAt)}` : 'Chưa có giờ cụ thể'}</Text></View>
      <View style={styles.shiftInfo}><Text style={styles.shiftName}>{item.shift}</Text><Text style={styles.detail}>{item.role}{item.store ? ` · ${item.store}` : ''}</Text></View>
      {item.date === today ? <Text style={styles.todayTag}>HÔM NAY</Text> : null}
    </View>)}
    {data && data.items.length > 4 ? <Text style={styles.more}>Còn {data.items.length - 4} ca khác trong tuần</Text> : null}
    <Text style={styles.footnote}>Hiển thị lịch phân ca, chưa có dữ liệu chấm công vào / ra.</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#ffffff', borderRadius: 18, padding: 20, marginBottom: 18, borderWidth: 1, borderColor: '#ececec', shadowColor: '#171717', shadowOpacity: 0.045, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  eyebrow: { color: '#e3262e', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, title: { color: '#171717', fontSize: 18, fontWeight: '800', marginTop: 4 },
  refresh: { color: '#e3262e', fontSize: 13, fontWeight: '700' }, period: { color: '#737373', fontSize: 12, marginTop: 4 }, loader: { marginVertical: 16 },
  shift: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, backgroundColor: '#fafafa', borderRadius: 14, marginBottom: 9, borderWidth: 1, borderColor: '#f0f0f0' },
  today: { borderColor: '#e3262e', backgroundColor: '#fff8f8' }, dateColumn: { minWidth: 94 }, day: { color: '#171717', fontSize: 12, fontWeight: '800' }, hours: { color: '#737373', fontSize: 11, marginTop: 5 },
  shiftInfo: { flex: 1 }, shiftName: { color: '#171717', fontSize: 14, fontWeight: '700' }, detail: { color: '#737373', fontSize: 11, marginTop: 4 }, todayTag: { color: '#e3262e', fontSize: 9, fontWeight: '800' },
  empty: { color: '#737373', fontSize: 13, lineHeight: 19, paddingVertical: 7 }, error: { color: '#8f1414', fontSize: 13 }, more: { color: '#737373', fontSize: 12, marginTop: 2 }, footnote: { color: '#9a9a9a', fontSize: 10, lineHeight: 15, marginTop: 10 },
});
