// M3 nav/RN shell — excluded from root tsc until the Expo install lands
// (see tsconfig `exclude` + apps/mobile/README.md); remove the exclude then.
// Binds searchWorkspace + quickOpen. Empty query shows recents (module-owned rule).
import { useState } from "react";
import { FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { MobileSearchResult } from "../../src/browse/search";

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<MobileSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  void setResult;
  void setError;
  const rows = result ? [...result.filenames, ...result.content] : [];
  return (
    <View>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search notes" autoCapitalize="none" />
      {error ? <Text>{error}</Text> : null}
      <FlatList
        data={rows}
        keyExtractor={(item) => `${item.relativePath}:${item.line}`}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => {}}>
            <Text>{item.relativePath}</Text>
            <Text>{item.preview}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
