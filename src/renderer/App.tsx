import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { useCodeMirrorEditor } from "./hooks/use-editor";
import type { DirectoryEntry, FileReadResult, WorkspaceInfo } from "../shared/contracts/ipc";

type TabState = {
  key: string;
  relativePath: string;
  content: string;
  dirty: boolean;
  revisionHash: string;
  newlineStyle: "lf" | "crlf";
  hadBom: boolean;
  status: string;
};

export default function App(): JSX.Element {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [status, setStatus] = useState("No workspace open.");
  const [error, setError] = useState<string | null>(null);
  const activeTab = tabs.find((t) => t.key === activeKey) ?? null;
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshTree = useCallback(async (ws: WorkspaceInfo) => {
    const res = await window.takenotes.directory.list(ws.workspaceId, "");
    if (res.ok) setEntries(res.result);
    else setError(res.error.message);
  }, []);

  const openLocal = useCallback(async () => {
    setError(null);
    const res = await window.takenotes.workspace.openLocal();
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    if (res.result) {
      setWorkspace(res.result);
      setStatus(`Connected: ${res.result.displayName}`);
      await refreshTree(res.result);
    }
  }, [refreshTree]);

  const openFile = useCallback(
    async (relativePath: string) => {
      if (!workspace) return;
      const key = `${workspace.workspaceId}:${relativePath}`;
      const existing = tabs.find((t) => t.key === key);
      if (existing) {
        setActiveKey(key);
        return;
      }
      const res = await window.takenotes.file.read(workspace.workspaceId, relativePath);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      const file: FileReadResult = res.result;
      setTabs((prev) => [
        ...prev,
        {
          key,
          relativePath,
          content: file.content,
          dirty: false,
          revisionHash: file.revision.hash,
          newlineStyle: file.newlineStyle,
          hadBom: file.hadBom,
          status: "clean",
        },
      ]);
      setActiveKey(key);
      setStatus(`Opened ${relativePath}`);
    },
    [workspace, tabs],
  );

  const onEdit = useCallback(
    (content: string) => {
      if (!activeKey) return;
      setTabs((prev) => prev.map((t) => (t.key === activeKey ? { ...t, content, dirty: true, status: "dirty" } : t)));
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        setStatus("Draft noted (renderer-side; persistent drafts land with Stage 7).");
      }, 1000);
    },
    [activeKey],
  );

  const save = useCallback(async () => {
    if (!workspace || !activeTab) return;
    setStatus("Saving…");
    const res = await window.takenotes.file.write({
      workspaceId: workspace.workspaceId,
      relativePath: activeTab.relativePath,
      content: activeTab.content,
      expectedHash: activeTab.revisionHash,
      newlineStyle: activeTab.newlineStyle,
      hadBom: activeTab.hadBom,
    });
    if (!res.ok) {
      setError(res.error.code === "CONFLICT" ? "Conflict: the file changed on disk. Reload before saving." : res.error.message);
      setStatus("Save failed.");
      return;
    }
    setTabs((prev) =>
      prev.map((t) => (t.key === activeTab.key ? { ...t, dirty: false, status: "saved", revisionHash: res.result.hash } : t)),
    );
    setStatus(`Saved ${activeTab.relativePath}`);
  }, [workspace, activeTab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const editorRef = useCodeMirrorEditor(activeTab?.content ?? "", onEdit);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #ddd" }}>
        <strong>takenotes</strong>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12 }}>{workspace ? `${workspace.displayName} (${workspace.type})` : "no workspace"}</span>
        <button onClick={() => void openLocal()}>Open local folder</button>
        <button onClick={() => void save()} disabled={!activeTab?.dirty}>
          Save (Ctrl+S)
        </button>
      </header>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <aside style={{ width: 260, borderRight: "1px solid #ddd", overflow: "auto", padding: 8 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Files</div>
          {entries.map((e) => (
            <div key={e.relativePath}>
              {e.kind === "directory" ? (
                <div style={{ fontSize: 13 }}>📁 {e.name}</div>
              ) : (
                <button
                  style={{ display: "block", width: "100%", textAlign: "left", fontSize: 13 }}
                  onClick={() => void openFile(e.relativePath)}
                >
                  {e.name}
                </button>
              )}
            </div>
          ))}
          {entries.length === 0 && <div style={{ fontSize: 12, color: "#888" }}>Open a folder to list Markdown files.</div>}
        </aside>
        <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #ddd", padding: 4, overflowX: "auto" }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveKey(t.key)}
                style={{
                  fontSize: 12,
                  padding: "4px 8px",
                  background: t.key === activeKey ? "#e8e8e8" : "transparent",
                  border: "1px solid #ccc",
                }}
              >
                {t.relativePath}
                {t.dirty ? " •" : ""}
              </button>
            ))}
          </div>
          {activeTab ? (
            <div key={activeTab.key} ref={editorRef} style={{ flex: 1, overflow: "auto", textAlign: "left" }} />
          ) : (
            <div style={{ padding: 24, color: "#666" }}>
              <p>No file open. Open a local folder, then pick a Markdown file.</p>
              <p>WSL workspaces arrive with Stage 6 (helper-backed browsing).</p>
            </div>
          )}
        </main>
      </div>
      <footer style={{ borderTop: "1px solid #ddd", padding: "6px 12px", fontSize: 12, display: "flex", gap: 12 }}>
        <span>{status}</span>
        <span style={{ flex: 1 }} />
        {error && <span style={{ color: "#a00" }}>{error}</span>}
      </footer>
    </div>
  );
}
