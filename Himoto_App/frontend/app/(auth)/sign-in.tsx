import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../../src/core/session';

export default function SignIn() {
  const { ready, user, login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!ready) return <ActivityIndicator style={{ flex: 1 }} />;
  if (user) return <Redirect href="/(tabs)" />;
  const submit = async () => {
    setError(''); setBusy(true);
    try { await login(email.trim(), password); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không đăng nhập được.'); }
    finally { setBusy(false); }
  };
  return <SafeAreaView style={styles.root}><View style={styles.card}>
    <Image source={require('../../assets/images/logo-himoto-dark.png')} style={styles.brand} resizeMode="contain" accessibilityLabel="HIMOTO" /><Text style={styles.title}>Đăng nhập</Text>
    <Text style={styles.label}>Email hoặc tên đăng nhập</Text>
    <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="username" keyboardType="email-address" />
    <Text style={styles.label}>Mật khẩu</Text>
    <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Pressable style={[styles.button, busy && { opacity: 0.5 }]} disabled={busy || !email || !password} onPress={submit}>
      <Text style={styles.buttonText}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</Text>
    </Pressable>
  </View></SafeAreaView>;
}

const styles = StyleSheet.create({ root: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fafafa' }, card: { backgroundColor: '#ffffff', borderRadius: 22, padding: 26, borderWidth: 1, borderColor: '#ececec', shadowColor: '#171717', shadowOpacity: 0.07, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  brand: { width: 156, height: 34, alignSelf: 'flex-start' }, title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.8, color: '#171717', marginTop: 22, marginBottom: 24 },
  label: { color: '#405653', fontWeight: '700', fontSize: 14, marginBottom: 8 }, input: { borderWidth: 1, borderColor: '#d6d6d6', backgroundColor: '#fbfcf8', borderRadius: 13, paddingHorizontal: 15, height: 52, fontSize: 16, color: '#171717', marginBottom: 19 },
  error: { color: '#8f1414', marginBottom: 14, fontSize: 14 }, button: { backgroundColor: '#e3262e', padding: 16, borderRadius: 13, alignItems: 'center', marginTop: 2 }, buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 16, letterSpacing: 0.2 } });
