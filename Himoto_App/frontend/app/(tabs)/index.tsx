import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiGet } from "../../src/core/api";
import type { Dashboard } from "../../src/core/models";
import { can, useSession } from "../../src/core/session";
import { FinanceSummary } from "../../src/components/FinanceSummary";
import { MyDutyRoster } from "../../src/components/MyDutyRoster";

export default function Home() {
  const router = useRouter();
  const { user } = useSession();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void apiGet<Dashboard>("/dashboard")
      .then(setDashboard)
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Không tải được tổng quan.",
        ),
      );
  }, []);
  const quickActions: { title: string; detail: string; icon: string; href: Href }[] = [
    ...(can(user, "contracts.draft") ? [
      { title: "Làm hợp đồng", detail: "Tạo bản nháp hợp đồng mới.", icon: "+", href: { pathname: "/(tabs)/contracts", params: { action: "create" } } as Href },
    ] : []),
    ...(can(user, "contracts.return") ? [
      { title: "Trả xe", detail: "Tìm hợp đồng, chọn xe và ghi nhận trả xe.", icon: "↩", href: { pathname: "/(tabs)/contracts", params: { action: "return" } } as Href },
    ] : []),
    ...(can(user, "contracts.renew") ? [
      { title: "Gia hạn", detail: "Cập nhật ngày hẹn trả và ghi nhận phí gia hạn.", icon: "↻", href: { pathname: "/(tabs)/contracts", params: { action: "renew" } } as Href },
    ] : []),
    { title: "Trạng thái kho xe", detail: "Mở danh sách xe và kiểm tra trạng thái.", icon: "▣", href: "/(tabs)/fleet" },
    ...(can(user, "contracts.read") && (can(user, "contracts.draft") && can(user, "contracts.finalize") || can(user, "contracts.renew") || can(user, "finance.write")) ? [
      { title: "Nhập bổ sung giao dịch", detail: "Chọn hợp đồng, gia hạn hoặc khoản thu/chi cần bổ sung.", icon: "↕", href: { pathname: "/(tabs)/contracts", params: { action: "backfill" } } as Href },
    ] : []),
  ];
  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Image
          source={require("../../assets/images/logo-himoto-dark.png")}
          style={styles.brand}
          resizeMode="contain"
          accessibilityLabel="HIMOTO"
        />
        <Text style={styles.hello}>Xin chào, {user?.name}</Text>
        <Text style={styles.subtitle}>Tổng quan công việc</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!dashboard && !error ? <ActivityIndicator /> : null}
        {dashboard ? (
          <View style={styles.metricsRow}>
            {dashboard.contracts ? (
              <View
                style={styles.metricCard}
                accessibilityLabel={`Hợp đồng đang hoạt động: ${dashboard.contracts.active}`}
              >
                <Text style={styles.metricLabel} numberOfLines={1}>
                  HĐ đang thuê
                </Text>
                <Text style={styles.metricValue} numberOfLines={1}>
                  {dashboard.contracts.active}
                </Text>
              </View>
            ) : null}
            {dashboard.contracts ? (
              <View
                style={styles.metricCard}
                accessibilityLabel={`Hợp đồng quá hạn: ${dashboard.contracts.overdue}`}
              >
                <Text style={styles.metricLabel} numberOfLines={1}>
                  HĐ quá hạn
                </Text>
                <Text style={styles.metricValue} numberOfLines={1}>
                  {dashboard.contracts.overdue}
                </Text>
              </View>
            ) : null}
            <View
              style={styles.metricCard}
              accessibilityLabel={`Xe trong hệ thống: ${dashboard.fleet.total}`}
            >
              <Text style={styles.metricLabel} numberOfLines={1}>
                Tổng xe
              </Text>
              <Text style={styles.metricValue} numberOfLines={1}>
                {dashboard.fleet.total}
              </Text>
            </View>
          </View>
        ) : null}
        {can(user, "finance.read") ? <FinanceSummary /> : null}
        <MyDutyRoster />
        <Text style={styles.sectionTitle}>Thao tác nhanh</Text>
        <View style={styles.actionGrid}>
          {quickActions.map((action) => (
            <Pressable
              key={action.title}
              style={styles.actionCard}
              accessibilityRole="button"
              accessibilityLabel={`${action.title}. ${action.detail}`}
              onPress={() => router.push(action.href)}
            >
              <View style={styles.actionIcon}><Text style={styles.actionIconText}>{action.icon}</Text></View>
              <Text style={styles.actionTitle}>{action.title}</Text>
              <Text style={styles.actionDetail}>{action.detail}</Text>
              <Text style={styles.actionArrow}>›</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fafafa" },
  content: { padding: 20, paddingTop: 28 },
  brand: { width: 132, height: 27, marginBottom: 24, alignSelf: "flex-start" },
  hello: {
    fontSize: 29,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: "#171717",
  },
  subtitle: { color: "#737373", fontSize: 15, marginTop: 7, marginBottom: 26 },
  error: { color: "#8f1414" },
  metricsRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  metricCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: "#ececec",
    shadowColor: "#171717",
    shadowOpacity: 0.045,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  metricLabel: { color: "#737373", fontSize: 11, fontWeight: "600" },
  metricValue: {
    fontSize: 27,
    fontWeight: "800",
    letterSpacing: -0.7,
    color: "#e3262e",
    marginTop: 8,
  },
  sectionTitle: {
    color: "#171717",
    fontSize: 19,
    fontWeight: "800",
    marginTop: 16,
    marginBottom: 14,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 11,
    paddingBottom: 18,
  },
  actionCard: {
    width: "48.5%",
    minHeight: 148,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ececec",
    borderRadius: 18,
    padding: 14,
    shadowColor: "#171717",
    shadowOpacity: 0.045,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  actionIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: "#fff5f5", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  actionIconText: { color: "#e3262e", fontSize: 21, fontWeight: "700", lineHeight: 24 },
  actionTitle: { color: "#171717", fontSize: 14, fontWeight: "800" },
  actionDetail: {
    color: "#737373",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
    paddingRight: 6,
  },
  actionArrow: {
    color: "#e3262e",
    fontSize: 24,
    position: "absolute",
    right: 13,
    bottom: 8,
  },
});
