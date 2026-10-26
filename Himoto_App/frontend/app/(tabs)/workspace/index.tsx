import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FinanceSummary } from '../../../src/components/FinanceSummary';
import { RecordWorkspace } from '../../../src/components/RecordWorkspace';
import { can, useSession } from '../../../src/core/session';

type Shortcut = { title: string; detail: string; href: Href };

export default function Workspace() {
  const { user } = useSession();
  const router = useRouter();
  if (can(user, 'customers.read')) return <RecordWorkspace kind="customers" />;

  const shortcuts: Shortcut[] = [
    ...(can(user, 'hr.read') ? [
      { title: 'Nhân sự', detail: 'Tra cứu danh sách nhân viên và vị trí làm việc.', href: '/staff' as Href },
      { title: 'Lịch trực cơ sở', detail: 'Xem và quản lý lịch phân ca theo tuần.', href: '/duty-roster' as Href },
    ] : []),
    ...(can(user, 'contracts.read') ? [
      { title: 'Báo cáo cuối ca', detail: 'Xem các báo cáo gần đây trong phạm vi được phép.', href: '/shift-reports' as Href },
    ] : []),
    { title: 'Danh bạ cơ sở', detail: 'Xem các cơ sở đang hoạt động.', href: '/stores' },
  ];

  return <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>{can(user, 'hr.read') ? 'Nhân sự & vận hành' : 'Không gian làm việc'}</Text>
      <Text style={styles.subtitle}>Lối tắt đến các chức năng theo quyền truy cập của bạn.</Text>
      {can(user, 'finance.read') ? <FinanceSummary /> : null}
      <Text style={styles.sectionTitle}>Truy cập nhanh</Text>
      {shortcuts.map(item => <Pressable key={item.title} style={styles.card} accessibilityRole="button" onPress={() => router.push(item.href)}>
        <View style={styles.cardCopy}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.cardDetail}>{item.detail}</Text></View>
        <Text style={styles.arrow}>›</Text>
      </Pressable>)}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafa' },
  content: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 32 },
  title: { color: '#171717', fontSize: 28, fontWeight: '800', letterSpacing: -0.7 },
  subtitle: { color: '#737373', fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 21 },
  sectionTitle: { color: '#171717', fontSize: 18, fontWeight: '800', marginTop: 5, marginBottom: 12 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#ececec', borderRadius: 16, paddingHorizontal: 18, paddingVertical: 17, marginBottom: 11, shadowColor: '#171717', shadowOpacity: 0.045, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  cardCopy: { flex: 1 },
  cardTitle: { color: '#171717', fontSize: 16, fontWeight: '700' },
  cardDetail: { color: '#737373', fontSize: 13, lineHeight: 19, marginTop: 5 },
  arrow: { color: '#e3262e', fontSize: 29, marginLeft: 10 },
});
