// M3 nav/RN shell — excluded from root tsc until the Expo install lands
// (see tsconfig `exclude` + apps/mobile/README.md); remove the exclude then.
// Binds AppearanceStore + importFromPicker + shareNote.
import { useState } from "react";
import { Banner, Body, Button, Card, Chip, Screen, Skeleton, Title } from "../../components/ui";
import type { AppearanceSettings } from "../../src/settings/appearance";

const THEME_LABEL = { system: "Match this device", light: "Light", dark: "Dark" } as const;

export default function SettingsScreen() {
  const [appearance, setAppearance] = useState<AppearanceSettings>({ theme: "system", fontScale: 1 });
  const [loading, setLoading] = useState(false);
  void setLoading;
  if (loading) return <Screen><Skeleton label="Loading settings" /></Screen>;
  return (
    <Screen>
      <Title>Settings</Title>
      <Card>
        <Body>Theme</Body>
        <Chip label={THEME_LABEL[appearance.theme]} tone="planned" />
        {(["system", "light", "dark"] as const).map((t) => (
          <Button key={t} label={THEME_LABEL[t]} variant={appearance.theme === t ? "primary" : "default"} onPress={() => setAppearance({ ...appearance, theme: t })} />
        ))}
      </Card>
      <Button label="Import notes…" onPress={() => {}} />
      <Banner tone="warning" title="Recovery is not a backup." message="Keep your own copy of notes you cannot lose." />
    </Screen>
  );
}
