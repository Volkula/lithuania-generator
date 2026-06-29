# AGENTS.md

Guidance for AI agents and contributors working on **Lithania Generator**.

## What this project is

A static, client-only React + TypeScript (Vite) web app that generates strict
1024×1024 black & white Warhammer 40k litany images. No backend. Deployed to
GitHub Pages via GitHub Actions.

## Project layout

```
index.html                  # entry, loads Google fonts
vite.config.ts              # base = /lithuania-generator/ for prod builds
src/
  main.tsx                  # React bootstrap
  App.tsx                   # top-level UI: sidebar tabs, layers, properties
  index.css                 # all styles (dark editor theme)
  types.ts                  # EditorState + layer models, CANVAS_SIZE
  data/litanies.ts          # curated, sorted litany library
  data/iconLibrary.ts       # AUTO-GENERATED index of 456 wh40k icon SVGs
public/wh40k/               # vendored faction iconography SVGs (seal-generator)
  hooks/useHistory.ts       # undo/redo history (commit vs replace modes)
  lib/
    images.ts               # image cache + load notifications
    render.ts               # scene drawing, B/W threshold, text wrapping
    exportImage.ts          # PNG/JPEG/WebP + 1-bit BMP encoder
    importDoc.ts            # .txt / .docx import (mammoth)
    customLibrary.ts        # user dictionary in localStorage + JSON import/export
    project.ts              # save/load whole project + autosave
    presets.ts              # one-click layout presets
  components/
    CanvasStage.tsx         # interactive canvas (select/move/resize/crop/snap)
    ui.tsx                  # small reusable controls
eslint.config.js            # flat ESLint config (eslint 9 + typescript-eslint)
.github/workflows/deploy.yml
.github/workflows/ci.yml    # typecheck + lint + prettier + build
```

## Core concepts

- **Single source of truth**: `EditorState` (layers, background, frame, bw,
  canvasBg, selectedId). Rendering is a pure function of this state.
- **Rendering**: `drawScene(ctx, state, { includeFrame })` paints background →
  image layers → global B/W pass → text → frame. Text is drawn _after_ the B/W
  pass so it stays crisp 1-bit.
- **History**: `useHistory` keeps `past/present/future`. Use `set(updater,
"commit")` for discrete edits and `set(updater, "replace")` during continuous
  gestures (slider drag, canvas drag). A gesture should `commit` on its first
  change and `replace` afterwards, producing one undo entry per gesture.
- **Selection coordinates**: the canvas is logical 1024² and CSS-scaled.
  `CanvasStage.toCanvasCoords` converts pointer → canvas space using the bounding
  rect scale.

## Conventions

- Keep everything client-side; do not add a server.
- All exported imagery must remain strictly black & white.
- Colours for text/frame are restricted to `#000000` / `#ffffff` (`MonoColor`).
- New layer types must implement a bounding box in `render.ts` `layerBox`.
- Run `npm run build` (does `tsc --noEmit` first) before committing; keep it
  green and lint-clean (`noUnusedLocals`/`noUnusedParameters` are on).

## Gotchas

- Canvas tainting from cross-origin images breaks `getImageData`/`toBlob`. The
  B/W pass and export both read pixels, so a tainted canvas throws — handle and
  surface to the user, never swallow silently.
- `ctx.letterSpacing` is not universally typed; it's set defensively in a
  try/catch in `render.ts`.
- The Vite `base` must match the GitHub repo name for Pages to resolve assets.

## Workflow for changes

1. Make the change.
2. `npm run build` to type-check + bundle.
3. Manually smoke-test with `npm run dev`.
4. Record any bug you hit (and the fix) in `FIXLOG.md`.
5. Commit and push; the Actions workflow redeploys `main`.
