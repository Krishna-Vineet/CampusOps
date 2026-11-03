import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Button, Note, Screen, Title, colors } from "./components/ui";
import { AuthScreen } from "./features/AuthScreen";
import { ComplaintsScreen } from "./features/ComplaintsScreen";
import { EventsScreen } from "./features/EventsScreen";
import { InboxScreen } from "./features/InboxScreen";
import { PassesScreen } from "./features/PassesScreen";
import { PendingScreen, ProfileScreen } from "./features/ProfileScreen";
import { QuizScreen } from "./features/QuizScreen";
import { ScannerScreen } from "./features/ScannerScreen";
import { complaintLocationId } from "./lib/format";
import { SessionProvider, useSession } from "./lib/session";

type Tab = "events" | "inbox" | "passes" | "scan" | "issues" | "profile";
const tabs: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "events", label: "Events", icon: "◫" },
  { id: "inbox", label: "Updates", icon: "✉" },
  { id: "passes", label: "Passes", icon: "▣" },
  { id: "scan", label: "Scan", icon: "⌗" },
  { id: "issues", label: "Help", icon: "◇" },
  { id: "profile", label: "Profile", icon: "○" },
];

function Shell() {
  const { me, config, bootError, retryBoot } = useSession();
  const [tab, setTab] = useState<Tab>("events");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [quizTarget, setQuizTarget] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => {
    function receive(url: string | null) {
      if (!url) return;
      const id = complaintLocationId(url, config?.complaintQrBase ?? "");
      if (id) {
        setLocationId(id);
        setTab("issues");
      }
    }
    void Linking.getInitialURL().then(receive);
    const sub = Linking.addEventListener("url", ({ url }) => receive(url));
    return () => sub.remove();
  }, [config?.complaintQrBase]);
  if (bootError)
    return (
      <Screen>
        <Title title="Can't connect yet" subtitle="The mobile app needs the CampusOps API." />
        <Note message={bootError} />
        <Button label="Try again" onPress={retryBoot} />
      </Screen>
    );
  if (!me) return <AuthScreen />;
  if (me.user.status !== "ACTIVE") return <PendingScreen />;
  function openComplaint(id: string) {
    setLocationId(id);
    setTab("issues");
  }
  return (
    <View style={s.shell}>
      {Platform.OS === "web" && (
        <View style={s.preview}>
          <Text style={s.previewText}>Mobile app · browser review preview</Text>
        </View>
      )}
      <View style={s.body}>
        {tab === "events" &&
          (quizTarget ? (
            <QuizScreen
              eventId={quizTarget.id}
              eventTitle={quizTarget.title}
              onClose={() => setQuizTarget(null)}
            />
          ) : (
            <EventsScreen
              onOpenPasses={() => setTab("passes")}
              onOpenQuiz={(id, title) => setQuizTarget({ id, title })}
            />
          ))}
        {tab === "inbox" && <InboxScreen />}
        {tab === "passes" && <PassesScreen />}
        {tab === "scan" && <ScannerScreen onComplaint={openComplaint} />}
        {tab === "issues" && (
          <ComplaintsScreen
            locationId={locationId}
            onLocation={setLocationId}
            onScan={() => setTab("scan")}
          />
        )}
        {tab === "profile" && (
          <ProfileScreen
            onComplaints={() => {
              setLocationId(null);
              setTab("issues");
            }}
          />
        )}
      </View>
      <View style={s.nav} accessibilityRole="tablist">
        {tabs.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: tab === item.id }}
            testID={`tab-${item.id}`}
            onPress={() => {
              setTab(item.id);
              if (item.id !== "issues") setLocationId(null);
              if (item.id !== "events") setQuizTarget(null);
            }}
            style={[s.tab, tab === item.id && s.active]}
          >
            <Text style={[s.icon, tab === item.id && s.activeText]}>{item.icon}</Text>
            <Text style={[s.label, tab === item.id && s.activeText]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.safe} edges={["top", "left", "right", "bottom"]}>
        <StatusBar style="dark" />
        <SessionProvider>
          <Shell />
        </SessionProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  shell: { flex: 1, width: "100%", maxWidth: 720, alignSelf: "center" },
  body: { flex: 1 },
  preview: { backgroundColor: colors.soft, paddingVertical: 6, alignItems: "center" },
  previewText: { color: colors.primary, fontSize: 11, fontWeight: "600" },
  nav: {
    flexDirection: "row",
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 12, gap: 3 },
  active: { backgroundColor: colors.soft },
  icon: { fontSize: 21, color: colors.muted, lineHeight: 24 },
  label: { fontSize: 11, fontWeight: "600", color: colors.muted },
  activeText: { color: colors.primary },
});
