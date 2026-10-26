import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '../src/core/session';

export default function Index() {
  const { ready, user } = useSession();
  if (!ready) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  return <Redirect href={user ? '/(tabs)' : '/(auth)/sign-in'} />;
}
