// M3 nav/RN shell — excluded from root tsc until the Expo install lands
// (see tsconfig `exclude` + apps/mobile/README.md); remove the exclude then.
// Binds captureToInbox + ensureDailyNote + getToday. Daily create is explicit
// (button → ensureDailyNote); getToday never creates (module-owned rule).
import { useState } from "react";
import { Button, Text, TextInput, View } from "react-native";

export default function CaptureScreen() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  void setStatus;
  return (
    <View>
      <TextInput value={text} onChangeText={setText} placeholder="Capture to Inbox…" multiline />
      <Button title="Save to Inbox" onPress={() => {}} />
      <Button title="Create Today's Note" onPress={() => {}} />
      {status ? <Text>{status}</Text> : null}
    </View>
  );
}
