// M3 nav/RN shell — excluded from root tsc until the Expo install lands
// (see tsconfig `exclude` + apps/mobile/README.md); remove the exclude then.
// Tabs: Notes (Explorer) · Search · Capture (Inbox/Daily/Today) · Settings (appearance).
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: "Notes" }} />
      <Tabs.Screen name="search" options={{ title: "Search" }} />
      <Tabs.Screen name="capture" options={{ title: "Capture" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
