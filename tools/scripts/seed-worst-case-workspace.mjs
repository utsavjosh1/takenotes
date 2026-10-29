/** Seed a WORST-CASE workspace for design verification (TN-DESIGN-001).
 *
 * This is the break-ui dataset for TakeNotes: every value below is something a
 * real user could plausibly produce (people names, unbreakable emails, CJK/RTL,
 * emoji-first titles, 0/1/1284 counts, empty/one/1000-row collections, missing
 * link/favorite/attachment targets). It is shaped exactly like the demo data
 * (plain Markdown workspace opened with File → Open workspace) so worst cases
 * enter through the same boundary the demo data does: the workspace folder.
 *
 * Dev-only toggle (no production code reads this flag — the app renders
 * whatever folder is opened, so flipping datasets is a folder switch):
 *
 *   Demo:  node tools/scripts/seed-demo-workspace.mjs
 *          → open demo-workspace/
 *   Worst: node tools/scripts/seed-worst-case-workspace.mjs
 *          → open demo-workspace-worst/   (or --root <dir>)
 *   Small (fast CI smoke): --small  (20 bulk files, 32 huge-tasks; full mode
 *          writes 1000 bulk files + 1284 huge tasks)
 *
 * Automated toggle for tests: `TN_DATA=worst` selects the worst-case root —
 * see tests/support/design-harness.ts. Never ships to production; never read
 * by renderer code (asserted in tests/design/worst-case-harness.test.ts).
 *
 * Usage: node tools/scripts/seed-worst-case-workspace.mjs [-- --root <dir>] [--small]
 * Output: <repo>/demo-workspace-worst/ (gitignored) — open it in the app via
 * File → Open workspace and compare against demo-workspace/ at real width,
 * 320px, widest, 200% zoom, dark, and RTL where supported.
 *
 * Expected-missing targets (intentional, for recovery/empty-state review):
 *   Notes/Broken links.md → [[Notes/Does Not Exist]], [[Projects/Ghost]],
 *   ![[attachments/gone.png]], .takenotes/favorites.yaml → Notes/Ghost.md
 * Every other [[wikilink]] target is validated to exist.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const rootFlag = args.indexOf("--root");
const ROOT = rootFlag >= 0 && args[rootFlag + 1] ? resolve(args[rootFlag + 1]) : resolve("demo-workspace-worst");
const SMALL = args.includes("--small");

/** Full-mode stress sizes (break-ui: 1 vs 1284 counts, 1000-row lists). */
const HUGE_TASK_COUNT = SMALL ? 32 : 1284;
const BULK_FILE_COUNT = SMALL ? 20 : 1000;

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (base, days) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
};

const today = new Date();
const T = iso(today);
const fmt = (d) => iso(d);

const D = {
  overdue1: fmt(shift(today, -5)),
  overdue2: fmt(shift(today, -2)),
  today: T,
  tomorrow: fmt(shift(today, 1)),
  future: fmt(shift(today, 7)),
  pastYear: fmt(shift(today, -400)),
  epoch: "1970-01-01",
  farFuture: "2030-06-15",
};

const LONG_EMAIL = "bartholomew.fitzgerald@northwind-industries-holdings.example.com";
const LONG_URL =
  "https://example.com/workspaces/acme/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved";
const LONG_FILENAME_TITLE = "Q3 Board Deck — FINAL (revised) v12 [approved by legal].pdf";
const UUID = "9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f";

/** 1x1 transparent PNG — control image that must keep rendering. */
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const files = {
  "Inbox.md": `---
tags: [inbox]
---

# Inbox

Task capture lands here. Worst case: one unbreakable email + one accented name.

- [ ] Email ${LONG_EMAIL} the launch recap @due(${D.tomorrow})
- [ ] Call Aleksandra Wiśniewska-Kowalczyk back @due(${D.overdue2})
- [ ] a@b.co confirmed the venue
`,

  [`Daily/2026/10/${T}.md`]: `---
type: daily
date: ${T}
tags: [daily]
---

# ${T}

Delete this file to exercise the "today's note hasn't been started" empty state.

- [ ] Standup @scheduled(${T}T09:30)
- [ ] Review [[Notes/Meeting Notes — Aleksandra Wiśniewska-Kowalczyk]] @due(${T})
- [ ] Overdue follow-up @due(${D.overdue1})
- [x] Coffee (done)
`,

  "Notes/Aleksandra Wiśniewska-Kowalczyk.md": `---
title: Aleksandra Wiśniewska-Kowalczyk
tags: [contact]
---

# Aleksandra Wiśniewska-Kowalczyk

Long, hyphenated, diacritics. Wraps to two lines; the hyphen is a break point.
Contact: ${LONG_EMAIL}
`,

  "Notes/Christopher Alexander Montgomery III.md": `---
title: Christopher Alexander Montgomery III
tags: [contact]
---

# Christopher Alexander Montgomery III

Long with suffix. Naive first+last initials give CI.
`,

  "Notes/Konstantin Oberhauser-Wettstein.md": `---
title: Konstantin Oberhauser-Wettstein
---

# Konstantin Oberhauser-Wettstein

Long and compound; overflows single-line rows.
`,

  "Notes/Jo.md": `---
title: Jo
tags: [contact, lone-worst-case]
---

# Jo

Two letters. The name column is mostly empty; naive initials give J.
This is the single match for the "One" collection (tag:lone-worst-case).
`,

  "Notes/J.md": `---
title: J
---

# J

One letter. Single-character initials; tiny click target if the name is the link.
`,

  "Notes/Ólafur Darri Ólafsson.md": `---
title: Ólafur Darri Ólafsson
---

# Ólafur Darri Ólafsson

Leading accented capital; sort and initials edge case.
`,

  "Notes/Đặng Thị Ngọc Hân.md": `---
title: Đặng Thị Ngọc Hân
---

# Đặng Thị Ngọc Hân

Stacked Vietnamese diacritics; clipped by tight line-height + overflow hidden.
`,

  "Notes/王秀英陈小龙刘伟王芳刘洋陈静杨帆赵磊黄敏周杰.md": `---
title: 王秀英陈小龙刘伟王芳刘洋陈静杨帆赵磊黄敏周杰
---

# 王秀英陈小龙刘伟王芳刘洋陈静杨帆赵磊黄敏周杰

CJK, no spaces. Breaks anywhere; word-based initials logic finds one word.
Shorter control: [[Notes/王秀英]].
`,

  "Notes/王秀英.md": `---
title: 王秀英
---

# 王秀英

Short CJK control. See the long CJK title for the wrap case.
`,

  "Notes/نور الهدى عبد الرحمن.md": `---
title: نور الهدى عبد الرحمن
---

# نور الهدى عبد الرحمن

RTL. Punctuation and icons land on the wrong side without dir="auto".
`,

  "Notes/Seán O'Brien-Ó Súilleabháin.md": `---
title: Seán O'Brien-Ó Súilleabháin
---

# Seán O'Brien-Ó Súilleabháin

Apostrophe and accents; escaping, initials, search.
`,

  "Notes/María José de la Cruz y Fernández.md": `---
title: María José de la Cruz y Fernández
---

# María José de la Cruz y Fernández

Lowercase particles; "sort by last name" gives the wrong answer.
`,

  "Notes/dana.md": `---
title: dana
---

# dana

All lowercase; initials should still render uppercase.
`,

  "Notes/🦊 Fox.md": `---
title: 🦊 Fox
---

# 🦊 Fox

Emoji first. charAt(0) returns half a surrogate pair.
`,

  "Notes/👩🏽‍💻 Priya.md": `---
title: 👩🏽‍💻 Priya
---

# 👩🏽‍💻 Priya

ZWJ emoji sequence; .length is 7+, slicing breaks it into pieces.
`,

  [`Notes/${LONG_FILENAME_TITLE}.md`]: `---
title: ${LONG_FILENAME_TITLE}
---

# ${LONG_FILENAME_TITLE}

File name where items differ at the END — end-truncation makes siblings
identical. Middle-truncation candidate. UUID: ${UUID}
`,

  "Notes/Tag wall.md": `---
tags: [design, frontend, q3, urgent, needs-review, customer-feedback-from-enterprise-onboarding, Benachrichtigungseinstellungen, backend, docs, polish, sensor-noir, perf]
---

# Tag wall

Twelve tags on one item, incl. one tag wider than its container
(customer-feedback-from-enterprise-onboarding) and a 30-char German compound
with no spaces (Benachrichtigungseinstellungen). Paramètres de
confidentialité et de sécurité — French runs ~30% longer than English.
`,

  "Notes/Identifiers.md": `---
tags: [reference]
---

# Identifiers

Plus-addressing: first.last+billing-notifications@example.com — validation
that rejects + and display that truncates the meaningful part.
Subdomains: ops@sub.department.region.example.co.uk.
Short: a@b.co.

Long URL (end-truncation hides the part that differs):
${LONG_URL}
`,

  "Notes/Escaping probe.md": `---
tags: [reference]
---

# Escaping probe

<script>alert(1)</script> &amp; **bold** — must render as literal text,
never as markup. Ampersand entity included.
`,

  "Notes/Long description.md": `---
tags: [reference]
---

# Long description

${"A pasted paragraph that never ends. ".repeat(55).trim()}
`,

  "Notes/Empty note.md": "",

  "Notes/Broken links.md": `---
tags: [reference]
---

# Broken links

Every target on this page is intentionally missing (expected-missing set):

- File: [[Notes/Does Not Exist]]
- Heading: [[Projects/Ghost#Milestones]]
- Image: ![[attachments/gone.png]]

Control (must resolve): [[Notes/Jo]] and ![[attachments/mockup.png]].
`,

  "Notes/Meeting Notes — Aleksandra Wiśniewska-Kowalczyk.md": `---
tags: [meeting]
---

# Meeting Notes — Aleksandra Wiśniewska-Kowalczyk

Attendees: Aleksandra Wiśniewska-Kowalczyk, Jo, 王秀英, 🦊 Fox.

## Decisions

- Ship without the blog.

## Tasks

- [ ] Send summary to ${LONG_EMAIL} @due(${D.tomorrow})
- [ ] Book room @scheduled(${D.today}T09:00)
`,

  "Projects/Website Redesign.md": `---
title: Website Redesign
tags: [project/website, active]
status: active
priority: high
due: ${D.future}
---

# Website Redesign

Hub note. Mockup control: ![[attachments/mockup.png]]

- [ ] Homepage copy @due(${D.overdue2})
- [ ] Approve mockup @due(${D.today})
- [ ] Launch dry-run @scheduled(${D.future}T10:00)
- [x] Kickoff call
`,

  "Projects/Ghost host.md": `---
tags: [project/website]
---

# Ghost host

Points at a collection query that matches nothing and a missing favorite.
See .takenotes/collections/empty.yaml and favorites.yaml (Ghost entry).
`,

  "Tasks/One overdue.md": `---
tags: [tasks]
---

# One overdue

Exactly one overdue task → Today must render "Overdue (1)", never "1 tasks".

- [ ] The single overdue item @due(${D.overdue1})
- [ ] Not overdue @due(${D.future})
`,

  "Events/Zero timestamp.md": `---
type: event
start: ${D.epoch}T00:00
end: ${D.epoch}T01:00
---

# Zero timestamp

A zero timestamp shown as a real date. Must not render as a plausible event.
`,

  "Events/Far future offsite.md": `---
type: event
start: ${D.farFuture}T18:00
end: ${D.farFuture}T21:00
---

# Far future offsite

Future date: relative copy must read "in N days", never "-N days ago".
Timezone edge: 23:30 -08:00 on Dec 31 shows as a different day in UTC.
`,

  "Events/Past year retro.md": `---
type: event
start: ${D.pastYear}T15:00
end: ${D.pastYear}T15:30
---

# Past year retro

11+ months ago: relative-time threshold — absolute date after a week or so.
`,

  "Single/Only child.md": `---
tags: [single]
---

# Only child

The one item in the Single/ folder (1-item file-tree + collection case).
`,
};

const takenotes = {
  ".takenotes/favorites.yaml": `version: 1
groups:
  - name: default
    entries:
      - type: file
        target: Notes/Jo.md
      - type: file
        target: Notes/Ghost.md
      - type: search
        target: tag:project/website
`,
  ".takenotes/collections/empty.yaml": `version: 1
name: Empty (worst case)
query: tag:no-such-tag-xyz-worst-case
views:
  - name: List
    kind: list
`,
  ".takenotes/collections/one.yaml": `version: 1
name: One (worst case)
query: tag:lone-worst-case
views:
  - name: List
    kind: list
`,
  ".takenotes/collections/huge.yaml": `version: 1
name: Huge (worst case)
query: tag:bulk-worst-case
views:
  - name: List
    kind: list
  - name: Table
    kind: table
    columns: [title]
`,
};

function writeAll() {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(ROOT, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content.endsWith("\n") || content === "" ? content : content + "\n");
  }
  for (const [rel, content] of Object.entries(takenotes)) {
    const abs = join(ROOT, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  // Empty/ — the 0-item case (the empty state must exist, not just render).
  mkdirSync(join(ROOT, "Empty"), { recursive: true });
  // Huge backlog — 1284 overdue tasks (full) for the 1-vs-1284 count + Today
  // virtualization stress. Anchored overdue so the Today aggregate lights up.
  const huge = [`---`, `tags: [tasks]`, `---`, ``, `# Huge backlog`, ``];
  for (let i = 1; i <= HUGE_TASK_COUNT; i++) {
    huge.push(`- [ ] Bulk overdue task ${String(i).padStart(4, "0")} @due(${D.overdue1})`);
  }
  huge.push("");
  writeFileSync(join(ROOT, "Tasks", "Huge backlog.md"), huge.join("\n"));
  // Bulk/ — 1000 tiny notes (full) carrying tag:bulk-worst-case for the Huge
  // collection + file-tree scroll stress.
  for (let i = 1; i <= BULK_FILE_COUNT; i++) {
    const rel = join("Archive", "Bulk", `bulk-${String(i).padStart(4, "0")}.md`);
    const abs = join(ROOT, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `---\ntags: [bulk-worst-case]\n---\n\n# Bulk ${i}\n`);
  }
  const attDir = join(ROOT, "attachments");
  mkdirSync(attDir, { recursive: true });
  writeFileSync(join(attDir, "mockup.png"), PIXEL_PNG);
}

/** Every [[target]] must exist, except the documented expected-missing set. */
const EXPECTED_MISSING = new Set([
  "Notes/Does Not Exist.md",
  "Projects/Ghost.md",
  "attachments/gone.png",
]);

function validateLinks() {
  const known = new Set([...Object.keys(files), ...Object.keys(takenotes), "attachments/mockup.png"]);
  for (let i = 1; i <= BULK_FILE_COUNT; i++) {
    known.add(`Archive/Bulk/bulk-${String(i).padStart(4, "0")}.md`);
  }
  known.add("Tasks/Huge backlog.md");
  const linkRe = /!?\[\[([^\]#^|]+)(?:[#^][^\]]*)?\]\]/g;
  const missing = [];
  for (const [rel, content] of Object.entries(files)) {
    for (const m of content.matchAll(linkRe)) {
      const target = m[1].trim();
      const withExt = target.endsWith(".md") ? target : `${target}.md`;
      if (!known.has(withExt) && !known.has(target) && !EXPECTED_MISSING.has(withExt) && !EXPECTED_MISSING.has(target)) {
        missing.push(`${rel} → [[${target}]]`);
      }
    }
  }
  const expectedAbsent = [...EXPECTED_MISSING].filter((m) => known.has(m));
  if (expectedAbsent.length > 0) {
    console.error(`Expected-missing targets unexpectedly exist:\n  ${expectedAbsent.join("\n  ")}`);
    process.exit(1);
  }
  // The probes must actually reference the missing targets (else the fixture
  // silently stops testing recovery states).
  const probe = files["Notes/Broken links.md"];
  for (const m of EXPECTED_MISSING) {
    const stem = m.replace(/\.md$/, "").split("/").pop();
    if (!probe.includes(stem)) {
      console.error(`Probe Notes/Broken links.md no longer references expected-missing: ${m}`);
      process.exit(1);
    }
  }
  if (missing.length > 0) {
    console.error("Broken demo links:\n" + missing.map((m) => `  ${m}`).join("\n"));
    process.exit(1);
  }
}

writeAll();
validateLinks();

const fileCount = Object.keys(files).length + Object.keys(takenotes).length + BULK_FILE_COUNT + 2;
console.log(`Seeded worst-case workspace (${SMALL ? "small" : "full"}: ${HUGE_TASK_COUNT} huge-tasks, ${BULK_FILE_COUNT} bulk files) — ${fileCount} files in ${ROOT} (today = ${T}).`);
console.log(`
Toggle (dev-only, at the workspace-folder data boundary):
  Demo:  node tools/scripts/seed-demo-workspace.mjs       → open demo-workspace/
  Worst: node tools/scripts/seed-worst-case-workspace.mjs  → open demo-workspace-worst/
  Then compare: real width, 320px, widest, 200% zoom, dark, RTL.
  Extra states: delete Daily/<today>.md for the no-Daily empty state;
  Empty/ (0 items), Single/ (1 item), Huge collection (1000 rows) cover
  the collection empty/one/huge split; Tasks/Huge backlog.md covers 1284.
`);
