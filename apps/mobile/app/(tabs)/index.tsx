// M3 nav/RN shell — excluded from root tsc until the Expo install lands
// (see tsconfig `exclude` + apps/mobile/README.md); remove the exclude then.
// Binds listExplorerEntries + getPreview + EditorSession. State shape mirrors
// the tested modules: workspaceId + relativePath only (never raw roots in UI).
import { useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import type { ExplorerEntry } from "../../src/browse/explorer";

export default function NotesScreen() {
  const [entries, setEntries] = useState<ExplorerEntry[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  void setEntries;
  void notice;
  void setNotice;
  return (
    <View>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.relativePath}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => {}}>
            <Text>{item.name}</Text>
            {item.kind === "directory" ? <Text>▸</Text> : null}
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text>No notes yet — capture one or import a file.</Text>}
      />
    </View>
  );
}
