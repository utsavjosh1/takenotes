# Benchmarks

No measurements recorded yet. Benchmarks must use **production release builds**
(not Vite dev server, not DevTools-open Electron).

## Method

1. Generate fixture: `node scripts/generate-fixture.mjs` (10k files, ~50 MiB
   equivalent, Unicode/space paths, excluded dirs — generated, never committed).
2. Measure: cold launch, warm launch, workspace open, file-tree first render,
   file open, tab switch, typing latency, save, external-edit detection,
   quick-open, content search, idle CPU, per-process memory
   (main/renderer/GPU/utility/helper), installer size.
3. Record hardware, Windows version, Electron version, build type, fixture
   parameters, date below.

## Results

| Date | Hardware | OS | Build | Metric | Value |
|---|---|---|---|---|---|
| — | — | — | — | — | No data yet |
