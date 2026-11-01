# v2 REA method — how Obsidian was reverse-engineered

> REA: `../REA/` — *Reverse Engineer Anything: one MCP for reverse engineering across binaries, applications, and runtime behavior* (`../REA/README.md`). Skill: `../REA/.agents/skills/reverse-engineer-anything/SKILL.md`. Design rules: `../REA/docs/tool-design.md`. JS workflows: `../REA/docs/javascript-application-workflows.md`.

## 1. Why REA for this task

The user asked to "use REA to rebuild Obsidian all features". Obsidian ships as a closed-source Electron app (JS bundle + native shell). REA is built exactly for this: *inspect the app without its source code, explain how the feature works, show the evidence, and build a version for your project* (`../REA/README.md` Quick start). v2 follows that loop:

```
target (Obsidian) → REA inspect/trace → evidence (observations + unknowns)
  → explanation (OBSIDIAN-FEATURES.md) → reconstruction (takenotes services/UI)
  → design (DESIGN-GUIDE.md) → verification (VERIFICATION.md)
```

Investigation flow figure: `../REA/website/public/assets/figures/rea-investigation-flow.svg`.

## 2. Targets selected (REA routing)

Per the REA skill routing table, the first tool is chosen from the target type:

| # | Target | REA route | What was actually used in v2 | Authority |
|---|--------|-----------|------------------------------|-----------|
| T1 | Obsidian desktop Electron bundle (closed) | `analyze_javascript_application` on extracted tree / ASAR | **Not executed** — no local Obsidian install, no ASAR on this host (checked `/opt/Obsidian*`, PATH). Documented as unknown; reconstruction uses T2 instead. | Unknown (no artifact digest) |
| T2 | Obsidian public Help + changelog + dev docs (website) | Browser analysis (`../REA/docs/browser-observation.md`, `website-script-export.md`, `web-runtime.md`) + saved-capture route | **Substituted with prior static capture**: `docs/research/OBSIDIAN_FEATURES_CURRENT.md` (2026-09-22, full Help/changelog/dev-docs citation hierarchy). Treated as *passive website observation* evidence, not live-probed runtime. | Observation (cited URLs per section) |
| T3 | takenotes own source tree | Normal repo tools (explicitly **not** REA per skill: "Skip REA for ordinary source-repository architecture analysis") | `CONTEXT.md`, `docs/roadmap.md`, `packages/*/src`, `apps/desktop/src`, `tests/*` read directly. | Observation (file/line) |
| T4 | takenotes built renderer bundle (optional cross-check) | `analyze_javascript_application` / `compare_source_to_bundle` | **Deferred** — v2 does not claim bundle parity; verification is via vitest + manual (see VERIFICATION.md). | Unknown |

No native provider (Hopper/Ghidra/IDA) was needed: no native-binary claim is made in v2. No `open_binary`, no runtime capture, no process execution beyond repo tests.

## 3. Commands a reproducer can run (when Obsidian is available)

These are the exact REA-native steps to deepen any v2 section from observation to traced evidence. They are **documented, not executed** in v2 (no target on host):

```bash
# 0. Register REA with your agent (one time, approve the plan first)
npx rea-agents setup

# 1. Static JS/Electron trace of an extracted Obsidian tree or ASAR
npx -y rea-agents@latest analyze-javascript-application /absolute/path/to/obsidian-app --json > obsidian-app-evidence.json

# 2. Feature trace from the saved evidence (example: pinned-tab behavior)
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const application = JSON.parse(readFileSync("obsidian-app-evidence.json", "utf8"));
writeFileSync("trace-input.json", JSON.stringify({
  application, seed: { kind: "string", value: "pinned" }, direction: "both"
}));'
npx -y rea-agents@latest trace-application-feature ./trace-input.json --json

# 3. Website observation of Obsidian Help (Chrome-family browser required)
# See ../REA/docs/browser-observation.md + web-runtime.md for target/scenario contracts.
```

MCP equivalents (`inspect_analysis_view`, `trace_application_feature`, `trace_javascript_semantics`, `compare_application_versions`, `compare_source_to_bundle`) share the same workflows; CLI returns the Evidence record directly, MCP returns it in `normalized_result` with `evidence_id` (see `../REA/docs/javascript-application-workflows.md` § CLI and verification).

## 4. Evidence taxonomy (preserved through v2)

Borrowed from `../REA/AGENTS.md` ("Distinguish observations, derivations, inferences, and unknowns; preserve Evidence provenance") and `../REA/docs/tool-design.md` ("Missing coverage is unknown, not absence"):

- **Observation** — directly seen: a Help paragraph, a changelog line, a source file, a passing test. Cited with location (URL or `path:line`).
- **Derivation** — mechanical transform of observations (e.g., "Help lists 11 search operators → grammar table"; "source `panes.ts:113` toggles boolean → pin is per-tab boolean"). Reproducible without judgment.
- **Inference** — best explanation bridging a gap (e.g., "Obsidian pin implies open-in-new-tab because pinned tab must not be replaced"). Marked with confidence + what would confirm it (a trace or probe).
- **Unknown** — explicitly not established (e.g., "Obsidian's exact fuzzy-match scoring"; "Canvas~Graph shared renderer internals"). Never rendered as absence.

The taxonomy is documented here and applied per-row in `OBSIDIAN-FEATURES.md` § Per-feature REA notes (the master map itself carries feature/type/behavior/reconstruction/status/owner columns, not four taxonomy columns). Session semantics: full inline evidence is kept in the docs (no retained-reference-only citations), because v2 readers have no live MCP connection.

## 5. Evidence ledger (what v2 claims, and what it does not)

| Claim | Basis | Provenance | Status |
|-------|-------|------------|--------|
| Obsidian 1.13.7 desktop / 1.13.8 mobile are latest public stable at research time | Changelog JSON + 1.13.7/1.13.8 notes | `docs/research/OBSIDIAN_FEATURES_CURRENT.md` § Current Versions → `obsidian.md/changelog.json` | Observation |
| Vault = normal folder + `.obsidian/` config; config name overridable; global settings in OS app-data; IndexedDB for Sync/cache | Help: data-storage, manage-vaults, configuration-folder, settings | Research doc § Storage/Vault Model | Observation |
| Pin tab: links from pinned tab open separately | Help: tabs | Research doc § Tabs and Workspace | Observation; takenotes reconstruction: `apps/desktop/src/renderer/panes.ts` (`togglePinned`, `closeOtherTabs`, `closeUnpinnedTabs`) + `use-documents.ts` |
| Command palette pins: max 20, above recents; recents auto (last 10 commands + last 20 files in takenotes Step 2) | Help: command-palette; roadmap Step 2 | Research doc § Command Palette; `docs/roadmap.md` Step 2 | Observation (Obsidian) + derivation (takenotes bound) |
| Search grammar: words AND, `"phrase"`, `OR`, parens, `-neg`, `/regex/`, `file: path: content: match-case: ignore-case: tag: line: block: section: task: task-todo: task-done:`, `[prop]` family + comparators | Help: search | Research doc § Search; `packages/core/src/search/query.ts` | Observation + reconstruction |
| Evernote import previously deferred; v2 implements `.enex` | Roadmap Step 8 ("Defer … Evernote …"); v2 change | `packages/core/src/import/enex.ts` + `plan.ts` + tests | Derivation (new observation after v2 code) |
| Obsidian exact fuzzy algorithm, ranking weights, index data structures, Sync wire protocol, Publish rendering pipeline | — | No artifact trace or capture in v2 | **Unknown** — v2 specifies behavior-compatible reconstruction, never byte parity |
| Any Catalyst-only item (outside-vault open, colored highlights, Kanban, MathJax 4.1.3, RTL flip, capture widgets) as stable | EA changelogs 1.14.x | Research doc flags each as CATALYST | Observation of *early-access* status; reconstruction deferred |

## 6. What "reconstruction" means here (REA obligation ledger)

Per `../REA/docs/reconstruction-obligation-ledgers.md` and `reconstruction-readiness.md`: a reconstruction must state what was proven, what was inferred, and what remains unknown — and must not claim provider-verified behavior it did not run. v2 honors this:

- No "byte-identical to Obsidian" claim anywhere.
- Every rebuilt feature lists: Obsidian behavior (observed) → takenotes behavior (reconstruction) → gap/unknown → verification (test/manual).
- Real-provider verification scope is stated in `VERIFICATION.md` (vitest logic + Linux integration + manual Windows/Mac/Linux checklist). Anything not run is marked unverified.
