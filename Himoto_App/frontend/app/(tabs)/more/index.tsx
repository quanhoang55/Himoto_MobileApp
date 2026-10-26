import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { can, useSession } from '../../../src/core/session';

type ModuleItem = { title: string; detail: string; permission: string; href?: Href };
type ModuleGroup = { title: string; items: ModuleItem[] };

export default function More() {
  const { user, logout } = useSession();
  const router = useRouter();
  const [error, setError] = useState('');
  const groups: ModuleGroup[] = [
    { title: 'Thuê xe & khách hàng', items: [
      { title: 'Hợp đồng', detail: 'Tra cứu hợp đồng và xem lịch sử thu chi.', permission: 'contracts.read', href: '/(tabs)/contracts' },
      { title: 'Khách hàng', detail: 'Tìm hồ sơ, thông tin liên hệ và tình trạng khách hàng.', permission: 'customers.read', href: '/customers' },
      { title: 'Nhắc nợ', detail: 'Soạn tin Zalo, gửi nhắc thanh toán và xem lịch sử gửi.', permission: 'contracts.read', href: '/debt-reminders' },
    ] },
    { title: 'Đội xe', items: [
      { title: 'Danh sách xe', detail: 'Tra cứu xe, trạng thái và lịch sử từng xe.', permission: 'vehicles.read', href: '/(tabs)/fleet' },
      { title: 'Lịch sử luân chuyển', detail: 'Lọc các lượt chuyển và nhận xe giữa các cơ sở.', permission: 'vehicles.read', href: '/vehicle-transfers' },
      { title: 'Định vị GPS', detail: 'Tìm xe, xem trạng thái thiết bị và mở vị trí trên bản đồ.', permission: 'vehicles.read', href: '/gps' },
    ] },
    { title: 'Tài chính', items: [
      { title: 'Tổng quan tài chính', detail: 'Xem doanh thu thuê xe, tổng thu và tổng chi trong tháng.', permission: 'finance.read', href: '/finance' },
      { title: 'Doanh thu thuê xe', detail: 'Chưa khả dụng trên mobile.', permission: 'contracts.read' },
      { title: 'Doanh thu nhân viên', detail: 'Chưa khả dụng trên mobile.', permission: 'contracts.read' },
    ] },
    { title: 'Nhân sự & cơ sở', items: [
      { title: 'Danh bạ cơ sở', detail: 'Xem các cơ sở đang hoạt động.', permission: 'vehicles.read', href: '/stores' },
      { title: 'Nhân sự', detail: 'Tra cứu nhân sự và vị trí làm việc.', permission: 'hr.read', href: '/staff' },
      { title: 'Lịch trực của tôi', detail: 'Xem ca trực cá nhân trong tuần trên Trang chủ.', permission: 'vehicles.read', href: '/(tabs)' },
      { title: 'Lịch trực cơ sở', detail: 'Xem lịch tuần; tài khoản có quyền HR có thể thêm, sửa và xóa ca.', permission: 'hr.read', href: '/duty-roster' },
      { title: 'Báo cáo cuối ca', detail: 'Xem 50 báo cáo gần đây trong phạm vi được phép.', permission: 'contracts.read', href: '/shift-reports' },
      { title: 'Cơ sở', detail: 'Chưa khả dụng trên mobile.', permission: 'settings.write' },
    ] },
    { title: 'Thiết lập', items: [
      { title: 'Loại hợp đồng', detail: 'Chưa khả dụng trên mobile.', permission: 'settings.write' },
      { title: 'Tích hợp GPS & Telegram', detail: 'Chưa khả dụng trên mobile.', permission: 'settings.write' },
      { title: 'Tài khoản & phân quyền', detail: 'Chưa khả dụng trên mobile.', permission: 'accounts.manage' },
    ] },
  ].map(group => ({ ...group, items: group.items.filter(item => can(user, item.permission)) }))
    .filter(group => group.items.length > 0);

  return <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>Danh mục công việc</Text>
    {groups.map(group => <View key={group.title} style={styles.group}>
      <Text style={styles.groupTitle}>{group.title}</Text>
      <View style={styles.groupCards}>
        {group.items.map(item => <Pressable key={item.title} style={styles.card} accessibilityRole={item.href ? 'button' : undefined} accessibilityState={{ disabled: !item.href }} disabled={!item.href} onPress={() => { if (item.href) router.push(item.href); }}>
          <Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.detail}>{item.detail}</Text>
        </Pressable>)}
      </View>
    </View>)}
    <View style={styles.accountGroup}>
      <Text style={styles.groupTitle}>Tài khoản</Text>
      <View style={styles.card}><Text style={styles.cardTitle}>{user?.name}</Text><Text style={styles.detail}>{user?.email}</Text><Text style={styles.detail}>{user?.access_role || user?.role}</Text></View>
    </View>
    {error ? <Text style={{ color: '#b42318', marginTop: 16 }}>{error}</Text> : null}
    <Pressable style={styles.button} onPress={() => void logout().catch(cause => setError(cause instanceof Error ? cause.message : 'Không đăng xuất được.'))}><Text style={styles.buttonText}>Đăng xuất</Text></Pressable>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafa' },
  content: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.7, color: '#171717', marginBottom: 25 },
  group: { marginBottom: 25 },
  groupTitle: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2, color: '#737373', marginBottom: 11, marginLeft: 3 },
  groupCards: { gap: 11 },
  accountGroup: { marginTop: 1 },
  card: { backgroundColor: '#ffffff', paddingHorizontal: 19, paddingVertical: 17, borderRadius: 18, borderWidth: 1, borderColor: '#ececec', shadowColor: '#171717', shadowOpacity: 0.045, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#171717' },
  detail: { color: '#737373', marginTop: 7, fontSize: 14, lineHeight: 20 },
  button: { marginTop: 22, padding: 16, backgroundColor: '#e3262e', borderRadius: 13, alignItems: 'center' },
  buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
});
