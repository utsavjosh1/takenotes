# Layout — takenotes

```
┌─────────────────────────────────────────────────┐
│ TitleBar 40px: workspace · Search… Ctrl P · win │
├────┬──────────────┬─────────────────────────────┤
│rail│ sidebar 240  │ tab strip 35px              │
│44px│              ├─────────────────────────────┤
│    │ file tree /  │ conflict bar (when needed)  │
│    │ search panel │ editor (readable width 760) │
│    │              │                             │
├────┴──────────────┴─────────────────────────────┤
│ StatusBar 24px: connection · words Ln Col save  │
└─────────────────────────────────────────────────┘
```

- Title bar uses hidden Electron chrome + native Window Controls Overlay;
  empty space drags (`-webkit-app-region: drag`), controls are `no-drag`.
  Never place click targets under the native caption-button safe area (~138px right).
- Activity rail 44px: Files, Search top; Settings bottom. 17px outline icons,
  34px hit target, accent tick for active.
- Sidebar 240px default (180 min, 360 max), drag-resize, persisted, `Ctrl+\`
  collapses (rail stays). Quieter surface than editor, filesystem rows 28px.
- Editor: no card/border/shadow. Centered readable column (default 760px,
  full-width toggle for tables/code). Padding top 32px, sides ≥28px.
- Status bar 24px, same surface as app. Left: connection. Right: words, Ln/Col,
  save state. Only real data.
- Focus mode (`Ctrl+.`): rail + sidebar + tab strip + status hide; editor
  expands, cursor/scroll preserved.
- Minimum window 800×520; baseline 1280×800. Editor keeps priority on shrink;
  sidebar clamps to min then collapses; tabs scroll horizontally (100–220px each).
