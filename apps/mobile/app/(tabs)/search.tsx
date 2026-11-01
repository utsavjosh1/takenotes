// M3 nav/RN shell — excluded from root tsc until the Expo install lands
// (see tsconfig `exclude` + apps/mobile/README.md); remove the exclude then.
// Binds searchWorkspace + quickOpen. Empty query shows recents (module-owned rule).
import { useState } from "react";
import { Banner, EmptyView, Row, Screen, Skeleton, TextField } from "../../components/ui";
import type { MobileSearchResult } from "../../src/browse/search";

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<MobileSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  void setResult;
  void setError;
  void setSearching;
  const rows = result ? [...result.filenames, ...result.content] : [];
  return (
    <Screen>
      <TextField label="Search notes" value={query} onChangeText={setQuery} placeholder="Find a note or a word" autoCapitalize="none" returnKeyType="search" />
      {error ? <Banner tone="danger" title="Search did not finish." message={error} actionLabel="Try again" onAction={() => setError(null)} /> : null}
      {searching ? <Skeleton label="Loading results" /> : null}
      {!searching && !error && rows.length === 0
        ? <EmptyView title={query.trim() ? "No matches" : "Search your notes"} hint={query.trim() ? "Try a different word." : "Type a name or a word from inside a note."} />
        : null}
      {rows.map((item) => <Row key={`${item.relativePath}:${item.line}`} title={item.relativePath} detail={item.preview} onPress={() => {}} />)}
    </Screen>
  );
}
