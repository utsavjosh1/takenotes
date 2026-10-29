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
table { width: 100%; border-collapse: collapse; margin: .5rem 0; }
td, th { text-align: left; padding: .25rem .5rem; border-bottom: 1px solid #ddd; font-size: .9rem; }
.revoked { opacity: .5; }
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
  <h2>Agents (MCP)</h2>
  <p>Give an AI agent scoped access to selected workspaces. Tokens are shown once.</p>
  <input id="agent-label" placeholder="Label (e.g. claude-code)" maxlength="64" />
  <select id="agent-workspace"></select>
  <label><input id="agent-readonly" type="checkbox" /> read-only</label>
  <button id="btn-agent-create">Create token</button>
  <div id="agent-status" class="banner info"></div>
  <div id="agent-new" style="display:none">
    <p>Copy now — it will not be shown again:</p>
    <pre id="agent-token"></pre>
    <p>Client config:</p>
    <pre id="agent-config"></pre>
  </div>
  <table id="agent-table"><tbody></tbody></table>
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
  await refreshAgents();
}
document.getElementById("btn-refresh").onclick = refreshWorkspaces;
async function logout(expired) {
  await api("/api/auth/logout", {});
  csrf = null; baseline = null;
  document.getElementById("agent-new").style.display = "none";
  document.getElementById("agent-token").textContent = "";
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
async function refreshAgents() {
  const sel = document.getElementById("agent-workspace");
  sel.innerHTML = "";
  for (const o of document.getElementById("workspaces").options) {
    const opt = document.createElement("option");
    opt.value = o.value; opt.textContent = o.textContent;
    sel.appendChild(opt);
  }
  const { status, body } = await api("/api/rpc/agents.list", {});
  if (status === 401) return await logout(true);
  const tbody = document.querySelector("#agent-table tbody");
  tbody.innerHTML = "";
  if (!body.ok) return;
  for (const t of body.result) {
    const tr = document.createElement("tr");
    if (t.revokedAt) tr.className = "revoked";
    for (const text of [t.label, t.scope, t.workspaceIds.length + " workspace(s)", new Date(t.createdAt).toLocaleDateString()]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    }
    const td = document.createElement("td");
    if (t.revokedAt) { td.textContent = "revoked"; }
    else {
      const b = document.createElement("button");
      b.textContent = "Revoke";
      b.onclick = async () => {
        await api("/api/rpc/agents.revoke", { id: t.id });
        await refreshAgents();
      };
      td.appendChild(b);
    }
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}
document.getElementById("btn-agent-create").onclick = async () => {
  const label = document.getElementById("agent-label").value.trim();
  const workspaceId = document.getElementById("agent-workspace").value;
  const scope = document.getElementById("agent-readonly").checked ? "read" : "write";
  const { status, body } = await api("/api/rpc/agents.create", { label, workspaceIds: [workspaceId], scope });
  if (status === 401) return await logout(true);
  if (!body.ok) { show("agent-status", "Could not create: " + body.error.message); return; }
  show("agent-status", "");
  const token = body.result.token;
  document.getElementById("agent-token").textContent = token;
  document.getElementById("agent-config").textContent = JSON.stringify({
    mcpServers: { takenote: {
      command: "node",
      args: ["takenotes-mcp.cjs", "--server", location.origin],
      env: { TAKENOTES_TOKEN: token },
    } },
  }, null, 2);
  document.getElementById("agent-new").style.display = "block";
  document.getElementById("agent-label").value = "";
  await refreshAgents();
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
