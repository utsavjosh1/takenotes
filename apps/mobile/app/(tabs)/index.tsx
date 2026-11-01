// M3 nav/RN shell — excluded from root tsc until the Expo install lands
// (see tsconfig `exclude` + apps/mobile/README.md); remove the exclude then.
// Binds listExplorerEntries + getPreview + EditorSession. State shape mirrors
// the tested modules: workspaceId + relativePath only (never raw roots in UI).
import { useState } from "react";
import { View } from "react-native";
import { Banner, EmptyView, Row, Screen, Skeleton } from "../../components/ui";
import type { ExplorerEntry } from "../../src/browse/explorer";

type Status = "loading" | "ready" | "error";

export default function NotesScreen() {
  const [entries, setEntries] = useState<ExplorerEntry[]>([]);
  const [status, setStatus] = useState<Status>("ready");
  void setEntries;
  void setStatus;
  if (status === "loading") return <Screen><Skeleton label="Loading notes" /></Screen>;
  if (status === "error") {
    return <Screen><Banner tone="danger" title="Could not read your notes." message="The folder may be disconnected." actionLabel="Try again" onAction={() => setStatus("ready")} /></Screen>;
  }
  if (entries.length === 0) {
    return <Screen><EmptyView title="No notes yet" hint="Capture a thought or import a note to get started." /></Screen>;
  }
  return (
    <Screen>
      <View accessibilityRole="list">
        {entries.map((item) => <Row key={item.relativePath} title={item.name} kind={item.kind === "directory" ? "folder" : "file"} onPress={() => {}} />)}
      </View>
    </Screen>
  );
}
