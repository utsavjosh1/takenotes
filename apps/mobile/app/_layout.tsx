// M3 nav/RN shell — excluded from root tsc until the Expo install lands
// (see tsconfig `exclude` + apps/mobile/README.md); remove the exclude then.
// Binds: MobileWorkspace + buildMobileIndex + listExplorerEntries (all tested).
import { Stack } from "expo-router";

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
