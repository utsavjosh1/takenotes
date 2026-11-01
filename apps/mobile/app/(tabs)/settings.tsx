// M3 nav/RN shell — excluded from root tsc until the Expo install lands
// (see tsconfig `exclude` + apps/mobile/README.md); remove the exclude then.
// Binds AppearanceStore + importFromPicker + shareNote.
import { useState } from "react";
import { Button, Text, View } from "react-native";
import type { AppearanceSettings } from "../../src/settings/appearance";

export default function SettingsScreen() {
  const [appearance, setAppearance] = useState<AppearanceSettings>({ theme: "system", fontScale: 1 });
  void setAppearance;
  return (
    <View>
      <Text>Theme: {appearance.theme}</Text>
      <Button title="Import Markdown…" onPress={() => {}} />
      <Text>Recovery is not backup.</Text>
    </View>
  );
}
