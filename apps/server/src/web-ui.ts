/**
 * Minimal first-party browser proof UI (Gate C).
 *
 * Deliberately framework-free vanilla JS in one page: login → workspace
 * list → open note → edit → save with expectedRevision → CONFLICT display
 * → logout. It exercises exactly the same `/api/*` surface as
 * `TakenotesClient` — it is a proof harness, not a remote UI migration.
 */
export const WEB_UI_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>takenotes server</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
pre, textarea { width: 100%; box-sizing: border-box; }
textarea { min-height: 240px; font-family: monospace; }
.banner { padding: .5rem .75rem; border-radius: 6px; margin: .5rem 0; display: none; }
.banner.show { display: block; }
.banner.conflict { background: #fde8e8; }
.banner.ok { background: #e6f6e6; }
.banner.info { background: #eef; }
</style>
</head>
<body>
<h1>takenotes server</h1>
<div id="view-login">
  <h2>Login</h2>
  <input id="password" type="password" placeholder="Owner password" autocomplete="current-password" />
  <button id="btn-login">Log in</button>
  <p id="login-error" class="banner conflict"></p>
</div>
<div id="view-app" style="display:none">
  <h2>Workspaces</h2>
  <select id="workspaces"></select>
  <button id="btn-refresh">Refresh</button>
  <button id="btn-logout">Log out</button>
  <h2>Note</h2>
  <input id="note-path" value="README.md" />
  <button id="btn-open">Open</button>
  <div id="status" class="banner info"></div>
  <div id="conflict" class="banner conflict"></div>
  <textarea id="editor"></textarea>
  <button id="btn-save">Save</button>
</div>
<script>
let csrf = null;
let baseline = null;
async function api(path, body, method) {
  const headers = { "content-type": "application/json" };
  if (csrf) headers["x-csrf-token"] = csrf;
  const res = await fetch(path, { method: method || "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
function show(id, text) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.classList.toggle("show", !!text);
}
document.getElementById("btn-login").onclick = async () => {
  const password = document.getElementById("password").value;
  const { status, body } = await api("/api/auth/login", { password });
  if (status === 200 && body.ok) {
    csrf = body.result.csrfToken;
    document.getElementById("view-login").style.display = "none";
    document.getElementById("view-app").style.display = "block";
    show("login-error", "");
    await refreshWorkspaces();
  } else if (status === 429) {
    show("login-error", "Too many attempts. Wait and retry.");
  } else {
    show("login-error", "Login failed.");
  }
};
async function refreshWorkspaces() {
  const { status, body } = await api("/api/rpc/workspace.list", {});
  if (status === 401) return await logout(true);
  const sel = document.getElementById("workspaces");
  sel.innerHTML = "";
  for (const w of body.result) {
    const opt = document.createElement("option");
    opt.value = w.workspaceId;
    opt.textContent = w.displayName;
    sel.appendChild(opt);
  }
}
document.getElementById("btn-refresh").onclick = refreshWorkspaces;
async function logout(expired) {
  await api("/api/auth/logout", {});
  csrf = null; baseline = null;
  document.getElementById("view-app").style.display = "none";
  document.getElementById("view-login").style.display = "block";
  show("login-error", expired ? "Session expired. Log in again." : "");
}
document.getElementById("btn-logout").onclick = () => logout(false);
document.getElementById("btn-open").onclick = async () => {
  const workspaceId = document.getElementById("workspaces").value;
  const relativePath = document.getElementById("note-path").value;
  const { status, body } = await api("/api/rpc/note.read", { workspaceId, relativePath });
  if (status === 401) return await logout(true);
  if (!body.ok) { show("status", "Open failed: " + body.error.code); return; }
  baseline = body.result;
  document.getElementById("editor").value = body.result.content;
  show("status", "Opened. revision " + body.result.revision.hash.slice(0, 12));
  show("conflict", "");
};
document.getElementById("btn-save").onclick = async () => {
  const workspaceId = document.getElementById("workspaces").value;
  const relativePath = document.getElementById("note-path").value;
  const { status, body } = await api("/api/rpc/note.update", {
    workspaceId, relativePath,
    content: document.getElementById("editor").value,
    expectedHash: baseline ? baseline.revision.hash : "",
    newlineStyle: baseline ? baseline.newlineStyle : "lf",
    hadBom: baseline ? baseline.hadBom : false,
  });
  if (status === 401) return await logout(true);
  if (!body.ok && body.error.code === "CONFLICT") {
    show("conflict", "CONFLICT: the file changed elsewhere. Your edits are still in the editor. Re-open to load the current version, then retry.");
    return;
  }
  if (!body.ok) { show("status", "Save failed: " + body.error.code); return; }
  show("conflict", "");
  show("status", "Saved. revision " + body.result.hash.slice(0, 12));
  document.getElementById("btn-open").click();
};
(async () => {
  const res = await fetch("/api/auth/session");
  const body = await res.json();
  if (body.ok && body.result.authenticated) {
    csrf = body.result.csrfToken;
    document.getElementById("view-login").style.display = "none";
    document.getElementById("view-app").style.display = "block";
    await refreshWorkspaces();
  }
})();
</script>
</body>
</html>
`;
