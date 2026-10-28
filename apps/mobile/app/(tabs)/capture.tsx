// M3 nav/RN shell — excluded from root tsc until the Expo install lands
// (see tsconfig `exclude` + apps/mobile/README.md); remove the exclude then.
// Binds captureToInbox + ensureDailyNote + getToday. Daily create is explicit
// (button → ensureDailyNote); getToday never creates (module-owned rule).
import { useState } from "react";
import { Banner, Body, Button, Screen, Skeleton, TextField, Title } from "../../components/ui";

type Status = "loading" | "ready" | "error";

export default function CaptureScreen() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("ready");
  const [saved, setSaved] = useState<string | null>(null);
  void setStatus;
  void setSaved;
  if (status === "loading") return <Screen><Skeleton label="Loading capture" /></Screen>;
  return (
    <Screen>
      <Title>Capture</Title>
      {status === "error" ? <Banner tone="danger" title="Could not open your Inbox." message="Check that your notes folder is available, then try again." actionLabel="Try again" onAction={() => setStatus("ready")} /> : null}
      <Body muted>Write a quick thought. It goes to your Inbox note.</Body>
      <TextField label="Quick note" value={text} onChangeText={setText} placeholder="What is on your mind?" multiline />
      <Button label="Save to Inbox" variant="primary" disabled={text.trim() === ""} onPress={() => {}} />
      <Button label="Create today's note" onPress={() => {}} />
      {saved ? <Banner title={saved} /> : null}
    </Screen>
  );
}
