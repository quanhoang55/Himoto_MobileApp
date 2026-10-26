import { Redirect } from 'expo-router';
import { ActivityIndicator, Platform } from 'react-native';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { can, useSession } from '../../src/core/session';

export default function TabLayout() {
  const { ready, user } = useSession();
  if (!ready) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!user) return <Redirect href="/(auth)/sign-in" />;
  const workspace = can(user, 'customers.read') ? 'Khách hàng' : can(user, 'finance.read') ? 'Kế toán' : can(user, 'hr.read') ? 'Nhân sự' : 'Công việc';
  const workspaceVisible = can(user, 'customers.read') || can(user, 'finance.read') || can(user, 'hr.read');
  return <NativeTabs
    tintColor="#e3262e"
    iconColor={{ default: '#7b8985', selected: '#e3262e' }}
    labelStyle={{ fontSize: 10, fontWeight: '600' }}
    labelVisibilityMode="unlabeled"
    backgroundColor={Platform.OS === 'ios' ? 'transparent' : '#ffffff'}
    blurEffect="systemChromeMaterial"
    shadowColor="#1717171a"
    minimizeBehavior="never"
  >
    <NativeTabs.Trigger name="index">
      <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md={{ default: 'home', selected: 'home' }} />
      <NativeTabs.Trigger.Label hidden>Trang chủ</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="contracts" hidden={!can(user, 'contracts.read')}>
      <NativeTabs.Trigger.Icon sf={{ default: 'doc.text', selected: 'doc.text.fill' }} md={{ default: 'description', selected: 'description' }} />
      <NativeTabs.Trigger.Label hidden>Hợp đồng</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="fleet">
      <NativeTabs.Trigger.Icon sf={{ default: 'car.side', selected: 'car.side.fill' }} md={{ default: 'directions_car', selected: 'directions_car' }} />
      <NativeTabs.Trigger.Label hidden>Đội xe</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="workspace" hidden={!workspaceVisible}>
      <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} md={{ default: 'workspaces', selected: 'workspaces' }} />
      <NativeTabs.Trigger.Label hidden>{workspace}</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="more">
      <NativeTabs.Trigger.Icon sf={{ default: 'ellipsis.circle', selected: 'ellipsis.circle.fill' }} md={{ default: 'more_horiz', selected: 'more_horiz' }} />
      <NativeTabs.Trigger.Label hidden>Thêm</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
  </NativeTabs>;
}
