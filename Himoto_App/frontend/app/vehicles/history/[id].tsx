import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiGet } from '../../../src/core/api';
import type { VehicleHistory } from '../../../src/core/models';

const date = (value: string | null) => value ? new Date(value).toLocaleString('vi-VN') : '—';

export default function VehicleHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [events, setEvents] = useState<VehicleHistory | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!id) return;
    setError('');
    try { setEvents(await apiGet<VehicleHistory>(`/vehicles/${encodeURIComponent(id)}/history`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được lịch sử xe.'); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  return <SafeAreaView style={styles.root} edges={['top', 'right', 'bottom', 'left']}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>Lịch sử xe</Text>
    {error ? <Pressable onPress={() => void load()}><Text style={styles.error}>{error} · Thử lại</Text></Pressable> : null}
    {!events && !error ? <ActivityIndicator /> : null}
    {events?.length === 0 ? <Text style={styles.muted}>Chưa có lịch sử xe.</Text> : null}
    {events?.map(event => <View key={event.id} style={styles.card}>
      <Text style={styles.name}>{event.label}</Text>
      <Text style={styles.muted}>{date(event.at)} · {event.actor || '—'}</Text>
      {event.responsibleStore || event.beneficiaryStore ? <Text style={styles.detail}>{event.responsibleStore || 'Chưa rõ cơ sở'} → {event.beneficiaryStore || 'Chưa rõ cơ sở đến'}</Text> : null}
      {event.location ? <Text style={styles.detail}>{event.location}</Text> : null}
    </View>)}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#fafafa' }, content: { padding: 20, paddingTop: 28, paddingBottom: 40 }, title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.7, color: '#171717', marginBottom: 16 }, card: { backgroundColor: '#ffffff', padding: 18, borderRadius: 16, marginBottom: 11, borderWidth: 1, borderColor: '#ececec', shadowColor: '#171717', shadowOpacity: 0.045, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 1 }, name: { fontSize: 16, fontWeight: '700', color: '#171717' }, detail: { color: '#404040', marginTop: 7, lineHeight: 21 }, muted: { color: '#737373', marginTop: 6, fontSize: 13 }, error: { color: '#8f1414', marginTop: 14 } });
