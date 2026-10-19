# Takenotes – Master Design Prompt (hallmark + impeccable + emilkowalski)

Use this as the single entry prompt when you want UI work in this repo.
It orchestrates all installed skills in the right order and locks repo constraints.

---

## Copy-paste master prompt

```markdown
You are working in takenotes — filesystem-first, local-first Markdown notebook
(Windows 11 + WSL2, Electron + React 19 + Vite).

Source of truth:
- CONTEXT.md language: Workspace (not Vault), Connection, Collection (not Base),
  View, Daily Note (`Daily/YYYY/MM/YYYY-MM-DD.md`), Today (not Daily Note),
  Event note, Favorite (not Bookmark), Task / Due vs Scheduled, Quick Open,
  Command Palette. Never rename these.
- Design tokens: `packages/ui/src/theme.ts` is truth,
  `packages/ui/src/tokens.css` + `apps/desktop/src/renderer/styles/app.css` are generated.
  Preserve `--tn-*` tokens, 4pt spacing, radius, light/dark themes
  (light paper #faf6ee / dark #151310, accent #4f41d6 / #ad9fff).
  Light/dark + contrast must keep passing.
- Stack: `apps/desktop/src/renderer/components/*.tsx`, no DB, no native toolchain.

Skill orchestration — follow in order, do not skip:

1. PRE-FLIGHT (hallmark Step 0 + impeccable context):
   Run `~/.agents/skills/impeccable/scripts/impeccable context --target <file-or-route>`.
   If launcher fails, say so then read PRODUCT.md/DESIGN.md directly.
   Then emit hallmark pre-flight block with file:line citations:
   font stack, palette (`:root` OKLCH/hex), motion stance
   (framer-motion/motion/gsap? else motion-cut), spacing, framework (Next/Astro/vanilla -> here: Vite+React+Electron).
   State: "will preserve: ... / will introduce: ...".
   Cache to `.hallmark/preflight.json`. Respect existing `design.md` if present as locked system.

2. CONTEXT GATE (hallmark Step 1):
   Ask once: Audience / Use case (single action) / Tone
   (editorial · brutalist · soft · utilitarian · luxury · playful · technical · austere).
   Accept "go ahead" -> infer and disclose in one line:
   "Going with: audience=X · use=Y · tone=Z."
   Genre: default editorial for reading surfaces (editor/docs), modern-minimal for Operate surfaces
   (Today pane, collections/board/calendar, Quick Open, Command Palette).
   Impeccable mode: Operate for task/productivity UI, Read for editor/docs, Persuade ONLY for marketing site.

3. AUDIT FIRST (no edits):
   - `hallmark audit <target>` — score vs anti-patterns, ranked punch list, do not edit.
   - `impeccable critique <target>` + `impeccable audit <target>` for UX heuristics + a11y/perf/responsive.
   - `emil-design-eng` review MUST be markdown table | Before | After | Why |, no Before:/After: lists.
   - `find-animation-opportunities` (read-only, max 5-7) + `review-animations` for existing motion.
   Report combined, ordered by leverage.

4. PLAN SHAPE:
   `impeccable shape <feature>` for UX before code. For single component vs page:
   If component-scope signals fire (single element, ≤30 words, single file, "just the X")
   -> hallmark Component-scope flow: skip macrostructure/nav/footer/hero, keep tokens + 2+1 fonts,
   MUST ship all 8 states (default/hover/focus-visible/active/disabled/loading/error/success)
   + `<Name>.preview.html` 8-state demo wrapper. Stamp `/* Hallmark · component: ... */`.
   Else -> hallmark Design flow: pick macrostructure FIRST from `references/macrostructures.md`
   (load ONLY picked file), pick nav N1a-N13 + footer Ft1-Ft8 (default AWAY from N1a/Ft3),
   pick theme from 21 catalog (rotate: differ from last `.hallmark/log.json` on paper-band/display/accent-hue).
   State: "Macrostructure: X. Nav: Y (prev Z because ...). Footer: W. Theme: T."

5. BUILD RULES (all emits):
   - In-place edits only. Before editing state exact files to modify/create/delete.
     Never delete routes/components/old site without explicit confirmation.
   - Locked tokens: every color/font refs `var(--tn-*)` or `var(--color-*)`, no inline hex/OKLCH/font-family.
     If missing, lift to token block first.
   - No honest-copy violations: no invented metrics/testimonials ("+47%", "50k teams").
     Use real numbers or `—` placeholder + grey block.
   - No re-drawn chrome (fake browser/phone/IDE bars), no italic headers (roman only, emphasis via weight/color/underline).
   - Motion (emil `animate` sequence): 1) Should it animate? 100+/day (Quick Open, palette toggle, list nav, shortcuts) = NO animation ever. Tens/day = imperceptible. Occasional (modals/drawers/toasts/settings) = standard 200-500ms. Rare (onboarding/empty/success) = delight budget. 2) Purpose in one word (feedback/spatial/state-bridge/explanation/delight). 3) Cheapest tool, extend tokens not fork. 4) GPU only (transform/opacity), ease-out on enter (never ease-in), no `transition:all`, no `scale(0)` (use 0.95+opacity), correct transform-origin (trigger, except modals centered), interruptible (transitions/springs not keyframes for toasts/toggles), asymmetric enter/exit, `prefers-reduced-motion` + `@media (hover:hover) and (pointer:fine)` gating included. Sub-300ms UI. Apple-design: respond on pointer-down, 1:1 drag with velocity handoff, springs for interruptible.
   - Mobile-native: `100dvh/100svh`, 16px min input font (no zoom), `-webkit-tap-highlight transparent`, `touch-action:manipulation`, `overscroll-behavior:none`, `viewport-fit=cover + env(safe-area-*)`, theme-color, test on hardware note.
   - Responsive verified 320/375/414/768: no h-scroll (`overflow-x:clip` not hidden), no two-line buttons/links, `minmax(0,1fr)` grids, `overflow-wrap:anywhere`.
   - Libraries: check package.json first, then `pick-ui-library` curated only (base-ui, cmdk, Sonner, input-otp, motion, NumberFlow, recharts/Liveline, dnd-kit, Virtuoso, zustand, clsx/cva, next-themes). Sonner: single `<Toaster/>` at root, `toast()` client-only.
   - `break-ui`: after build, map every rendered value + limit, build plausible worst-case dataset (Aleksandra Wiśniewska-Kowalczyk, long emails, Jo, 1284 members, empty/one/1000 rows, CJK/emoji), dev-only Demo/Worst toggle, report before fixing.

6. PROTOTYPE WHEN DIVERGENCE NEEDED:
   `prototype` for 3 (max 5) genuinely different variants on named axis (layout/density/personality/motion/interaction), isolated route `/prototypes/<slug>`, picker chrome verbatim from PICKER.md, instant switch, real copy, verify all render clean, present tradeoff table and STOP for user pick. Never touch prod during exploration. Delete surface after promote unless told to keep.

7. FINISH:
   - `impeccable polish + harden + clarify + adapt` pass (errors, empty, i18n, edge, copy voice, responsive).
   - `bolder` if bland, `quieter` if loud, `distill` if complex — only when asked.
   - hallmark Step 5 Preview block BEFORE code + Step 7 slop-test 58/58 with `/* Hallmark · pre-emit critique: P5 H4 E5 S4 R5 V5 */` stamp + macro/nav/footer/theme stamp + `.hallmark/log.json` append (pages only).
   - `impeccable extract` tokens/components if reusable.

Ask to redirect BEFORE writing 500 lines that miss intent. Refinement preserves identity/copy; redesign replaces world but keeps product truth — never split difference. Brief wins over taste.
```

## Smaller ready prompts

**Audit only:**
`hallmark audit apps/desktop/src/renderer/components/today-pane.tsx + impeccable critique + review-animations. No edits, ranked punch list.`

**Redesign one view in place:**
`hallmark redesign apps/desktop/src/renderer/components/collections.tsx --mood modern-minimal. Preserve --tn-* tokens + CONTEXT.md language. Component or page scope per signals. Preview block first, then in-place edits.`

**New component with variants:**
`prototype a task quick-add input for Today pane: 3 variants (Quiet/Dense/Playful) behind /prototypes/quick-add, using --tn-* tokens. Then break-ui worst-case + 8-state preview.`

**Motion fix:**
`improve-animations plan command palette + palette open animation — note 100+/day = no animation per frequency gate, propose instant + reduced-motion.`
```

