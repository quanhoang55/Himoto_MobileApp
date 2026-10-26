import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FinanceSummary } from '../../src/components/FinanceSummary';

export default function FinanceOverview() {
  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.root}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Tài chính</Text>
      <FinanceSummary />
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafa' },
  content: { padding: 20, paddingTop: 28 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.7, color: '#171717', marginBottom: 20 },
});
