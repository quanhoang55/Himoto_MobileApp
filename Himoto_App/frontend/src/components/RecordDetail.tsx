import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiGet } from '../core/api';
import type { RecordItem } from '../core/models';

export function RecordDetail({ kind }: { kind: 'contracts' | 'customers' | 'vehicles' }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<RecordItem | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { if (id) void apiGet<RecordItem>(`/${kind}/${encodeURIComponent(id)}`).then(setItem).catch(cause => setError(cause instanceof Error ? cause.message : 'Không tải được dữ liệu.')); }, [id, kind]);
  return <SafeAreaView style={styles.root} edges={['top', 'right', 'bottom', 'left']}><ScrollView contentContainerStyle={styles.content}>
    {!item && !error ? <ActivityIndicator /> : null}{error ? <Text style={styles.error}>{error}</Text> : null}
    {item ? <View style={styles.card}>
      <Text style={styles.title}>{item.code || item.license || item.name}</Text>
      {(item.code || item.license) ? <Text style={styles.label}>{item.name}</Text> : null}
      {item.customerName ? <Text style={styles.label}>Khách hàng: {item.customerName}</Text> : null}
      {item.customerPhone ? <Text style={styles.label}>Điện thoại khách: {item.customerPhone}</Text> : null}
      {item.phone ? <Text style={styles.label}>Điện thoại: {item.phone}</Text> : null}
      {item.email ? <Text style={styles.label}>Email: {item.email}</Text> : null}
      {item.address ? <Text style={styles.label}>Địa chỉ: {item.address}</Text> : null}
      <Text style={styles.label}>Trạng thái: {item.status}</Text>
      <Text style={styles.label}>Cơ sở: {item.storeName || 'Chưa xác định'}</Text>
      {kind === 'customers' ? <>
        {item.customerType ? <Text style={styles.label}>Loại khách: {item.customerType === 'foreign' ? 'Khách nước ngoài' : 'Khách Việt Nam'}</Text> : null}
        {item.nationality ? <Text style={styles.label}>Quốc tịch: {item.nationality}</Text> : null}
        {item.contactChannel ? <Text style={styles.label}>Kênh liên hệ: {item.contactChannel}{item.contactDetail ? ` · ${item.contactDetail}` : ''}</Text> : null}
        {item.idCard ? <Text style={styles.label}>Giấy tờ định danh: {item.idCard}</Text> : null}
        {item.idCardIssuedOn ? <Text style={styles.label}>Ngày cấp giấy tờ: {new Date(item.idCardIssuedOn).toLocaleDateString('vi-VN')}</Text> : null}
        {item.idCardIssuedBy ? <Text style={styles.label}>Nơi cấp: {item.idCardIssuedBy}</Text> : null}
        {item.driverLicenseNumber ? <Text style={styles.label}>Số GPLX: {item.driverLicenseNumber}</Text> : null}
        {item.driverLicenseIssuedOn ? <Text style={styles.label}>Ngày cấp GPLX: {new Date(item.driverLicenseIssuedOn).toLocaleDateString('vi-VN')}</Text> : null}
        {item.warningNote ? <Text style={styles.label}>Ghi chú / cảnh báo: {item.warningNote}</Text> : null}
        {item.contractCount ? <Text style={styles.label}>Số hợp đồng: {item.contractCount}</Text> : null}
        {item.firstRentedAt ? <Text style={styles.label}>Thuê lần đầu: {new Date(item.firstRentedAt).toLocaleDateString('vi-VN')}{item.firstRentalStoreName ? ` · ${item.firstRentalStoreName}` : ''}</Text> : null}
      </> : null}
      {item.endDate ? <Text style={styles.label}>Ngày kết thúc: {new Date(item.endDate).toLocaleDateString('vi-VN')}</Text> : null}
      {kind === 'contracts' ? <>
        {item.startDate ? <Text style={styles.label}>Ngày bắt đầu: {new Date(item.startDate).toLocaleDateString('vi-VN')}</Text> : null}
        {item.totalAmount != null ? <Text style={styles.label}>Tổng tiền: {new Intl.NumberFormat('vi-VN').format(item.totalAmount)} ₫</Text> : null}
        {item.paidAmount != null ? <Text style={styles.label}>Đã thu: {new Intl.NumberFormat('vi-VN').format(item.paidAmount)} ₫</Text> : null}
        <Pressable style={styles.action} onPress={() => router.push(`/contracts/history/${item.id}`)}><Text style={styles.actionText}>Xem lịch sử và thu chi</Text></Pressable>
      </> : null}
      {kind === 'vehicles' ? <Pressable style={styles.action} onPress={() => router.push(`/vehicles/history/${item.id}`)}><Text style={styles.actionText}>Xem lịch sử xe</Text></Pressable> : null}
    </View> : null}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#fafafa' }, content: { padding: 20 }, card: { backgroundColor: '#ffffff', padding: 22, borderRadius: 18, borderWidth: 1, borderColor: '#ececec', shadowColor: '#171717', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 1 }, title: { fontSize: 25, fontWeight: '800', letterSpacing: -0.6, color: '#171717', marginBottom: 14 }, label: { color: '#404040', fontSize: 15, lineHeight: 22, marginTop: 10 }, action: { backgroundColor: '#e3262e', padding: 16, borderRadius: 13, marginTop: 22 }, actionText: { color: '#ffffff', fontWeight: '700', textAlign: 'center', fontSize: 15 }, error: { color: '#8f1414' } });
