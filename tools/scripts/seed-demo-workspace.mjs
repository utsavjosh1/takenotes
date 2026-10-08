/** Seed a demo workspace for manual feature tours (NOT a test fixture).
 *
 * Usage: npm run demo:seed [-- --root <dir>]
 * Output: <repo>/demo-workspace/ (gitignored) — open it in the app via
 * File → Open workspace, then follow the printed tour.
 *
 * Dates are anchored to "today" (the day you run it) so the Today view
 * (overdue / due-today / scheduled-today) and the Calendar light up
 * immediately. Every [[wikilink]] target is validated to exist.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const rootFlag = args.indexOf("--root");
const ROOT = rootFlag >= 0 && args[rootFlag + 1] ? resolve(args[rootFlag + 1]) : resolve("demo-workspace");

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (base, days) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
};

const today = new Date();
const T = iso(today); // today
const fmt = (d) => iso(d);

const D = {
  overdue1: fmt(shift(today, -5)),
  overdue2: fmt(shift(today, -2)),
  today: T,
  tomorrow: fmt(shift(today, 1)),
  in2: fmt(shift(today, 2)),
  future: fmt(shift(today, 7)),
  pastEvent: fmt(shift(today, -3)),
};

/** 1x1 transparent PNG — enough for the attachment pipeline + image embeds. */
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const files = {
  "Inbox.md": `---
tags: [inbox]
---

# Inbox

Task capture lands here (New-task command appends below).

- [ ] Buy birthday gift @due(${D.tomorrow})
- [ ] Call dentist @due(${D.overdue2})
- [ ] Idea: office plant wall
`,

  [`Daily/2026/10/${D.today}.md`]: `---
type: daily
date: ${D.today}
tags: [daily]
---

# ${D.today}

Morning plan. See [[Projects/Website Redesign]] for today's focus.

- [ ] Standup @scheduled(${D.today}T09:30)
- [ ] Review [[Notes/Meeting Notes]] @due(${D.today})
- [ ] Overdue follow-up @due(${D.overdue1})
- [x] Coffee (done)
`,

  [`Daily/2026/10/${fmt(shift(today, -1))}.md`]: `---
type: daily
date: ${fmt(shift(today, -1))}
tags: [daily]
---

# ${fmt(shift(today, -1))}

Yesterday. Shipped the homepage draft, carried one item forward.

- [x] Ship homepage draft
- [ ] Carried: polish footer @due(${D.today})
`,

  "Projects/Website Redesign.md": `---
title: Website Redesign
aliases: [Redesign, Site Refresh]
tags: [project/website, active]
status: active
priority: high
due: ${D.future}
created: ${D.overdue1}
---

# Website Redesign

Hub note: everything about the refresh links back here. See the
[[Projects/Launch Checklist]] before ${(D.future)}, notes from
[[Notes/Meeting Notes#Decisions]], and the retro in [[Events/Team Retro]].

Related reading: [[Notes/Reading List]]. Mockup: ![[attachments/mockup.png]]

## Goals

- Faster homepage
- Clearer pricing

## Milestones

- [ ] Homepage copy @due(${D.overdue2})
- [ ] Approve mockup @due(${D.today})
- [ ] Design review @scheduled(${D.today}T14:00)
- [ ] Launch dry-run @scheduled(${D.in2}T10:00)
- [ ] Public launch @due(${D.future})
- [x] Kickoff call

Key decision ^launch-scope: launch without the blog migration.

#project/website #active
`,

  "Projects/Launch Checklist.md": `---
tags: [project/website]
status: active
---

# Launch Checklist

Child of [[Projects/Website Redesign]]. Work top-down.

- [ ] DNS cutover @due(${D.future})
- [ ] Rollback plan written @due(${D.in2})
- [ ] Status page draft
- [x] Staging deploy
`,

  "Notes/Meeting Notes.md": `---
tags: [meeting, project/website]
---

# Meeting Notes

Sync with design. Full context in [[Projects/Website Redesign]].

## Decisions

- Ship without blog (see [[Projects/Website Redesign#Goals]])
- Retro scheduled: [[Events/Team Retro]]

## Tasks

- [ ] Send summary @due(${D.tomorrow})
- [ ] Book room for review @scheduled(${D.in2}T09:00)
`,

  "Notes/Reading List.md": `---
tags: [reading]
---

# Reading List

Fuel for [[Projects/Website Redesign#Goals]].

- Design systems handbook #reading
- Pricing page teardown (links to [[Projects/Launch Checklist]])

#reading #project/website
`,

  "Events/Team Retro.md": `---
type: event
start: ${D.today}T15:00
end: ${D.today}T15:30
tags: [meeting]
---

# Team Retro

What shipped, what slipped. Follow-up lives in
[[Projects/Website Redesign#Milestones]].
`,

  "Events/Design Review.md": `---
type: event
start: ${D.today}T14:00
end: ${D.today}T14:45
tags: [meeting, project/website]
---

# Design Review

Review the ![[attachments/mockup.png]] against
[[Projects/Website Redesign#Goals]].
`,

  [`Events/Launch Party.md`]: `---
type: event
start: ${D.future}T18:00
end: ${D.future}T21:00
---

# Launch Party

Celebrate [[Projects/Launch Checklist]] hitting all green.
`,

  "Templates/Meeting.md": `---
tags: [template]
---

# {{title}}

Date: {{date}} at {{time}}

## Attendees

-

## Decisions

-

## Tasks

- [ ]
`,

  "Templates/Project.md": `---
tags: [template, project]
status: active
---

# {{title}}

Kickoff: {{date}}

## Goals

-

## Milestones

- [ ]
`,

  "Templates/Daily.md": `---
type: daily
date: {{date}}
tags: [daily]
---

# {{date}}

## Plan

- [ ]

## Log
`,
};

function writeAll() {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(ROOT, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content.endsWith("\n") ? content : content + "\n");
  }
  const attDir = join(ROOT, "attachments");
  mkdirSync(attDir, { recursive: true });
  writeFileSync(join(attDir, "mockup.png"), PIXEL_PNG);
}

/** Every [[target]] (minus #heading / ^block suffix) must be a seeded file. */
function validateLinks() {
  const known = new Set([...Object.keys(files), "attachments/mockup.png"]);
  const linkRe = /!?\[\[([^\]#^|]+)(?:[#^][^\]]*)?\]\]/g;
  const missing = [];
  for (const [rel, content] of Object.entries(files)) {
    for (const m of content.matchAll(linkRe)) {
      const target = m[1].trim();
      const withExt = target.endsWith(".md") ? target : `${target}.md`;
      if (!known.has(withExt) && !known.has(target)) missing.push(`${rel} → [[${target}]]`);
    }
  }
  if (missing.length > 0) {
    console.error("Broken demo links:\n" + missing.map((m) => `  ${m}`).join("\n"));
    process.exit(1);
  }
}

writeAll();
validateLinks();

const count = Object.keys(files).length + 1;
console.log(`Seeded ${count} files in ${ROOT} (today = ${T}).`);
console.log(`
Tour (open the folder as a workspace):
  1. Open Projects/Website Redesign.md — outgoing links pane, backlinks
     (Meeting Notes + Reading List point here), #project/website tag.
  2. Type [[ + "meet" / "Goals" / "^lau" — file / heading / block completion.
  3. Click ![[attachments/mockup.png]] — attachment import + image embed.
  4. Today view — overdue (${D.overdue1}, ${D.overdue2}), due ${D.today},
     scheduled ${D.today}T09:30/14:00.
  5. Calendar week of ${T} — Team Retro + Design Review events,
     @scheduled tasks alongside.
  6. Templates/ picker — insert Meeting.md at cursor ({{title/date/time}}).
  7. New-task command — appends to Inbox.md or today's Daily note.
  8. Search "retro", tags tree #project/website, properties view
     (status/priority/due across notes).
`);
