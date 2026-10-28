/**
 * Minimal first-party browser UI (Gate C).
 *
 * Framework-free vanilla JS in one page: log in → pick a workspace → open a
 * note → edit → save with an expected revision → show a conflict → manage
 * AI agent access keys → log out. It calls exactly the same `/api/*` surface
 * as `TakenotesClient`.
 *
 * Styling is the shared design: tokens and component styles come from
 * `@takenotes/ui/generated` (built from packages/ui), and markup uses the
 * shared class names (tn-button, tn-field-control, ui-banner, ui-table, ...).
 * This page defines only its own layout.
 */
import { ART, ICONS, domCss, tokensCss } from "@takenotes/ui/generated";
import { ERROR_WORDS } from "@takenotes/contracts/errors";

export { ERROR_WORDS };

const USED_ICONS = ["info", "warn", "error", "plus", "trash", "refresh"] as const;
const iconMarkup = Object.fromEntries(USED_ICONS.map((n) => [n, ICONS[n]]));

const PAGE_CSS = `
html, body { margin: 0; background: var(--app); color: var(--text); font: var(--fs-ui)/var(--lh-ui) var(--font); }
h1, h2, p { margin: 0; }
h2 { font-size: 16px; }
.srv-brand { font-weight: 700; letter-spacing: -.01em; }
.srv-spacer { flex: 1; }
.srv-page { max-inline-size: 760px; margin: 0 auto; padding: 24px 16px 48px; display: grid; gap: 16px; box-sizing: border-box; }
.srv-login { max-inline-size: 400px; }
.srv-stack { display: grid; gap: 12px; }
.srv-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; }
.srv-row > .tn-field { flex: 1 1 180px; }
.srv-hint { color: var(--muted); font-size: 13px; }
.srv-editor { min-block-size: 240px; font-family: var(--font-mono); font-size: 13px; line-height: 1.5; }
.srv-secret { margin: 0; padding: 8px 10px; background: var(--code); border-radius: var(--r-in); font: 12px var(--font-mono); white-space: pre-wrap; overflow-wrap: anywhere; }
.srv-empty { padding: 8px; }
.srv-table td:last-child { text-align: end; }
.srv-revoked { opacity: .6; }
[hidden] { display: none !important; }
`;

const SCRIPT = `
var ERROR_WORDS = ${JSON.stringify(ERROR_WORDS)};
var ICONS = ${JSON.stringify(iconMarkup)};
var ART_NOTES = ${JSON.stringify(ART.notes)};
var csrf = null;
var baseline = null;
var $ = function (id) { return document.getElementById(id); };

function api(path, body, method) {
  var headers = { "content-type": "application/json" };
  if (csrf) headers["x-csrf-token"] = csrf;
  return fetch(path, { method: method || "POST", headers: headers, body: body === undefined ? undefined : JSON.stringify(body) })
    .then(function (res) { return res.json().then(function (json) { return { status: res.status, body: json, offline: false }; }); })
    .catch(function (err) { return { status: 0, body: null, offline: true, reason: String(err && err.message || err) }; });
}
function svg(name) {
  return '<svg class="ui-icon ui-icon--sm" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>';
}
function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function button(label, variant, onclick) {
  var b = el("button", "tn-button tn-button--md" + (variant ? " tn-button--" + variant : ""), label);
  b.type = "button";
  b.onclick = onclick;
  return b;
}
/* Banner: bold lead, plain cause, one action, technical text collapsed in Details. */
function banner(host, tone, title, cause, opts) {
  opts = opts || {};
  clear(host);
  host.hidden = !title;
  if (!title) return;
  host.className = "ui-banner ui-banner--" + tone;
  if (tone === "info") host.removeAttribute("role"); else host.setAttribute("role", "alert");
  var icon = el("span"); icon.innerHTML = svg(tone === "danger" ? "error" : tone === "warn" ? "warn" : "info");
  var text = el("div", "ui-banner-text");
  text.appendChild(el("strong", "", title));
  if (cause) text.appendChild(document.createTextNode(" " + cause));
  if (opts.details) {
    var d = el("details", "ui-details");
    d.appendChild(el("summary", "", "Details"));
    d.appendChild(el("pre", "", opts.details));
    text.appendChild(d);
  }
  host.appendChild(icon); host.appendChild(text);
  if (opts.action) {
    var actions = el("div", "ui-banner-actions");
    actions.appendChild(button(opts.action.label, "", opts.action.run));
    host.appendChild(actions);
  }
}
function fail(host, result, retry) {
  if (result.offline) {
    banner(host, "danger", "Can't reach the server.", "Check your connection, then try again.", { details: result.reason, action: retry && { label: "Try again", run: retry } });
    return;
  }
  var code = result.body && result.body.error && result.body.error.code;
  var words = ERROR_WORDS[code] || ERROR_WORDS.INTERNAL_ERROR;
  var detail = result.body && result.body.error ? code + ": " + result.body.error.message : "HTTP " + result.status;
  banner(host, "danger", words.title + ".", words.cause, { details: detail, action: retry && { label: "Try again", run: retry } });
}
function skeleton(host, label) {
  clear(host);
  var s = el("div", "ui-skeleton"); s.setAttribute("role", "status"); s.setAttribute("aria-label", label);
  for (var i = 0; i < 2; i++) s.appendChild(document.createElement("i"));
  host.appendChild(s);
}
function empty(host, title, text) {
  clear(host);
  var box = el("div", "tn-empty-state srv-empty");
  var art = el("span"); art.innerHTML = '<svg class="ui-art" viewBox="0 0 140 96" aria-hidden="true" focusable="false">' + ART_NOTES + '</svg>';
  box.appendChild(art); box.appendChild(el("h2", "", title)); box.appendChild(el("p", "tn-empty-description", text));
  host.appendChild(box);
}
function fieldError(id, text) {
  var e = $(id);
  e.textContent = text || "";
  e.hidden = !text;
}
function setStatus(text) { $("status").textContent = text || ""; }

/* Confirm: native dialog gives focus trap, Escape and focus return. Cancel has focus. */
function confirmRevoke(label) {
  return new Promise(function (resolve) {
    var d = el("dialog", "tn-dialog");
    d.setAttribute("aria-labelledby", "confirm-title");
    var head = el("header", "tn-dialog-header"); var h = el("h2", "", "Revoke access"); h.id = "confirm-title"; head.appendChild(h);
    var body = el("div", "tn-dialog-body");
    body.appendChild(el("p", "", "Revoke " + label + "? Any agent using this key stops working right away. This cannot be undone."));
    var foot = el("footer", "tn-dialog-footer tn-actions");
    var cancel = button("Cancel", "", function () { d.close("cancel"); });
    var ok = button("Revoke access", "danger", function () { d.close("ok"); });
    ok.className += " ui-solid-danger";
    foot.appendChild(cancel); foot.appendChild(ok);
    d.appendChild(head); d.appendChild(body); d.appendChild(foot);
    d.addEventListener("close", function () { resolve(d.returnValue === "ok"); d.remove(); });
    document.body.appendChild(d);
    d.showModal();
    cancel.focus();
  });
}

function showApp(on) {
  $("view-login").hidden = on;
  $("view-app").hidden = !on;
  $("session").hidden = !on;
}

$("login-form").onsubmit = function (event) {
  event.preventDefault();
  var password = $("password").value;
  fieldError("login-error", "");
  banner($("login-offline"), "info", "");
  api("/api/auth/login", { password: password }).then(function (r) {
    if (r.offline) { fail($("login-offline"), r, function () { $("login-form").requestSubmit(); }); return; }
    if (r.status === 200 && r.body.ok) {
      csrf = r.body.result.csrfToken;
      $("password").value = "";
      showApp(true);
      refreshWorkspaces();
    } else if (r.status === 429) {
      fieldError("login-error", "Too many attempts. Wait a minute, then try again.");
      $("password").setAttribute("aria-invalid", "true");
    } else {
      fieldError("login-error", "That password is not right. Try again.");
      $("password").setAttribute("aria-invalid", "true");
      $("password").focus();
    }
  });
};
$("password").oninput = function () { $("password").removeAttribute("aria-invalid"); };

function refreshWorkspaces() {
  skeleton($("workspaces-state"), "Loading workspaces");
  $("workspaces").disabled = true;
  return api("/api/rpc/workspace.list", {}).then(function (r) {
    if (r.status === 401) return logout(true);
    var sel = $("workspaces");
    clear(sel);
    clear($("workspaces-state"));
    if (r.offline || !r.body.ok) { fail($("workspaces-state"), r, refreshWorkspaces); return; }
    if (r.body.result.length === 0) {
      empty($("workspaces-state"), "No workspaces yet", "Add a folder in the desktop app, then refresh this page.");
      return refreshAgents();
    }
    r.body.result.forEach(function (w) {
      var opt = el("option", "", w.displayName); opt.value = w.workspaceId; sel.appendChild(opt);
    });
    sel.disabled = false;
    return refreshAgents();
  });
}
$("btn-refresh").onclick = refreshWorkspaces;

function logout(expired) {
  return api("/api/auth/logout", {}).then(function () {
    csrf = null; baseline = null;
    $("agent-new").hidden = true;
    $("agent-token").textContent = "";
    $("editor").value = "";
    setStatus(""); banner($("conflict"), "warn", "");
    showApp(false);
    if (expired) banner($("login-offline"), "warn", "Your session ended.", "Log in again to continue.");
    else banner($("login-offline"), "info", "");
  });
}
$("btn-logout").onclick = function () { logout(false); };

function noteArgs() {
  return { workspaceId: $("workspaces").value, relativePath: $("note-path").value };
}
$("btn-open").onclick = function () {
  banner($("note-error"), "info", "");
  api("/api/rpc/note.read", noteArgs()).then(function (r) {
    if (r.status === 401) return logout(true);
    if (r.offline || !r.body.ok) { fail($("note-error"), r, $("btn-open").onclick); return; }
    baseline = r.body.result;
    $("editor").value = r.body.result.content;
    setStatus("Opened " + $("note-path").value + ".");
    banner($("conflict"), "warn", "");
  });
};
$("btn-save").onclick = function () {
  var args = noteArgs();
  args.content = $("editor").value;
  args.expectedHash = baseline ? baseline.revision.hash : "";
  args.newlineStyle = baseline ? baseline.newlineStyle : "lf";
  args.hadBom = baseline ? baseline.hadBom : false;
  banner($("note-error"), "info", "");
  $("btn-save").setAttribute("aria-busy", "true");
  api("/api/rpc/note.update", args).then(function (r) {
    $("btn-save").removeAttribute("aria-busy");
    if (r.status === 401) return logout(true);
    if (!r.offline && r.body && !r.body.ok && r.body.error.code === "CONFLICT") {
      var w = ERROR_WORDS.CONFLICT;
      banner($("conflict"), "warn", w.title + ".", w.cause, { details: "CONFLICT: " + r.body.error.message, action: { label: "Reload latest", run: function () { $("btn-open").click(); } } });
      return;
    }
    if (r.offline || !r.body.ok) { fail($("note-error"), r, $("btn-save").onclick); return; }
    banner($("conflict"), "warn", "");
    setStatus("Saved.");
    $("btn-open").click();
  });
};

function refreshAgents() {
  var sel = $("agent-workspace");
  clear(sel);
  var src = $("workspaces").options;
  for (var i = 0; i < src.length; i++) {
    var opt = el("option", "", src[i].textContent); opt.value = src[i].value; sel.appendChild(opt);
  }
  $("btn-agent-create").disabled = src.length === 0;
  skeleton($("agents-state"), "Loading AI agents");
  return api("/api/rpc/agents.list", {}).then(function (r) {
    if (r.status === 401) return logout(true);
    clear($("agents-state"));
    var tbody = $("agent-table").querySelector("tbody");
    clear(tbody);
    if (r.offline || !r.body.ok) { fail($("agents-state"), r, refreshAgents); $("agent-table-wrap").hidden = true; return; }
    $("agent-table-wrap").hidden = r.body.result.length === 0;
    if (r.body.result.length === 0) { empty($("agents-state"), "No AI agents yet", "Create an access key to let an agent read or edit your notes."); return; }
    r.body.result.forEach(function (t) {
      var tr = el("tr", t.revokedAt ? "srv-revoked" : "");
      var n = t.workspaceIds.length;
      [t.label, t.scope === "read" ? "Read only" : "Can edit", n + (n === 1 ? " workspace" : " workspaces"), new Date(t.createdAt).toLocaleDateString()].forEach(function (text) {
        tr.appendChild(el("td", "", text));
      });
      var td = el("td");
      if (t.revokedAt) td.appendChild(el("span", "ui-badge ui-badge--bad", "Revoked"));
      else {
        var b = button("Revoke", "danger", function () {
          confirmRevoke(t.label).then(function (yes) {
            if (!yes) { b.focus(); return; }
            api("/api/rpc/agents.revoke", { id: t.id }).then(function (res) {
              if (res.offline || (res.body && !res.body.ok)) { fail($("agent-status"), res); return; }
              refreshAgents();
            });
          });
        });
        b.className += " tn-button--sm"; b.setAttribute("aria-label", "Revoke access for " + t.label);
        td.appendChild(b);
      }
      tr.appendChild(td); tbody.appendChild(tr);
    });
  });
}
$("btn-agent-create").onclick = function () {
  var label = $("agent-label").value.trim();
  fieldError("agent-label-error", "");
  $("agent-label").removeAttribute("aria-invalid");
  if (!label) {
    fieldError("agent-label-error", "Give the agent a name, such as claude-code.");
    $("agent-label").setAttribute("aria-invalid", "true");
    $("agent-label").focus();
    return;
  }
  var scope = $("agent-readonly").checked ? "read" : "write";
  banner($("agent-status"), "info", "");
  api("/api/rpc/agents.create", { label: label, workspaceIds: [$("agent-workspace").value], scope: scope }).then(function (r) {
    if (r.status === 401) return logout(true);
    if (r.offline || !r.body.ok) { fail($("agent-status"), r, $("btn-agent-create").onclick); return; }
    var token = r.body.result.token;
    $("agent-token").textContent = token;
    $("agent-config").textContent = JSON.stringify({
      mcpServers: { takenote: { command: "node", args: ["takenotes-mcp.cjs", "--server", location.origin], env: { TAKENOTES_TOKEN: token } } },
    }, null, 2);
    $("agent-new").hidden = false;
    $("agent-label").value = "";
    return refreshAgents();
  });
};

api("/api/auth/session", undefined, "GET").then(function (r) {
  if (r.offline) { fail($("login-offline"), r, function () { location.reload(); }); return; }
  if (r.body && r.body.ok && r.body.result.authenticated) {
    csrf = r.body.result.csrfToken;
    showApp(true);
    refreshWorkspaces();
  }
});
`;

export const WEB_UI_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>takenotes server</title>
<style>${tokensCss}
${domCss}
${PAGE_CSS}</style>
</head>
<body>
<header class="ui-titlebar" role="banner">
  <span class="srv-brand">takenotes</span>
  <span class="srv-spacer"></span>
  <span id="session" hidden><button id="btn-logout" type="button" class="tn-button tn-button--md tn-button--ghost">Log out</button></span>
</header>
<main class="srv-page">
<section id="view-login" class="ui-card srv-login">
  <form id="login-form" class="srv-stack" novalidate>
    <h1>Log in</h1>
    <div class="tn-field">
      <label class="tn-field-label" for="password">Owner password</label>
      <input id="password" class="tn-field-control" type="password" autocomplete="current-password" aria-describedby="login-error" required />
      <p id="login-error" class="tn-field-error" role="alert" hidden></p>
    </div>
    <div id="login-offline" class="ui-banner" hidden></div>
    <button id="btn-login" type="submit" class="tn-button tn-button--md tn-button--primary">Log in</button>
  </form>
</section>
<div id="view-app" class="srv-stack" hidden>
  <section class="ui-card srv-stack" aria-labelledby="h-workspaces">
    <h2 id="h-workspaces">Workspace</h2>
    <div class="srv-row">
      <div class="tn-field"><label class="tn-field-label" for="workspaces">Folder</label><select id="workspaces" class="tn-field-control" disabled></select></div>
      <button id="btn-refresh" type="button" class="tn-button tn-button--md">Refresh</button>
    </div>
    <div id="workspaces-state"></div>
  </section>
  <section class="ui-card srv-stack" aria-labelledby="h-note">
    <h2 id="h-note">Note</h2>
    <div class="srv-row">
      <div class="tn-field"><label class="tn-field-label" for="note-path">Note path</label><input id="note-path" class="tn-field-control" value="README.md" /></div>
      <button id="btn-open" type="button" class="tn-button tn-button--md">Open</button>
    </div>
    <p id="status" class="srv-hint" role="status"></p>
    <div id="note-error" class="ui-banner" hidden></div>
    <div id="conflict" class="ui-banner" hidden></div>
    <div class="tn-field"><label class="tn-field-label" for="editor">Note text</label><textarea id="editor" class="tn-field-control ui-textarea srv-editor" placeholder="Open a note to edit it here."></textarea></div>
    <div><button id="btn-save" type="button" class="tn-button tn-button--md tn-button--primary">Save</button></div>
  </section>
  <section class="ui-card srv-stack" aria-labelledby="h-agents">
    <h2 id="h-agents">AI agents</h2>
    <p class="srv-hint">Give an AI agent access to one workspace. Access keys are shown only once.</p>
    <div class="srv-row">
      <div class="tn-field"><label class="tn-field-label" for="agent-label">Agent name</label><input id="agent-label" class="tn-field-control" maxlength="64" placeholder="claude-code" aria-describedby="agent-label-error" /><p id="agent-label-error" class="tn-field-error" role="alert" hidden></p></div>
      <div class="tn-field"><label class="tn-field-label" for="agent-workspace">Workspace</label><select id="agent-workspace" class="tn-field-control"></select></div>
    </div>
    <label class="ui-check-label" for="agent-readonly"><span class="ui-check"><input id="agent-readonly" type="checkbox" /><svg viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path d="m4.5 9.5 3 3 6-7" /></svg></span><span>Read only (the agent cannot change notes)</span></label>
    <div><button id="btn-agent-create" type="button" class="tn-button tn-button--md tn-button--primary">Create access key</button></div>
    <div id="agent-status" class="ui-banner" hidden></div>
    <div id="agent-new" class="ui-card ui-card--accent srv-stack" hidden>
      <strong>Copy this key now. It will not be shown again.</strong>
      <pre id="agent-token" class="srv-secret"></pre>
      <p class="srv-hint">Add this to your agent's settings:</p>
      <pre id="agent-config" class="srv-secret"></pre>
    </div>
    <div id="agents-state"></div>
    <div id="agent-table-wrap" class="ui-table-wrap" hidden>
      <table id="agent-table" class="ui-table srv-table" aria-label="AI agents">
        <thead><tr><th scope="col">Name</th><th scope="col">Access</th><th scope="col">Workspaces</th><th scope="col">Created</th><th scope="col"><span class="ui-visually-hidden">Actions</span></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </section>
</div>
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
