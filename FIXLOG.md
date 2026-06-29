# FIXLOG

A running log of things that broke the program and how they were fixed.

## 2026-06-29 — Initial build

### 1. Build failed: `process` not defined in `vite.config.ts`

- **Symptom:** `tsc` error `TS2580: Cannot find name 'process'` because
  `@types/node` was not installed and the config read `process.env.GITHUB_PAGES`.
- **Fix:** Switched to the function form of `defineConfig(({ command }) => …)`
  and derive `base` from `command === "build"` instead of an env var. No Node
  types required.

### 2. Build failed: project reference may not disable emit

- **Symptom:** `TS6310: Referenced project 'tsconfig.node.json' may not disable
emit` when running `tsc -b`.
- **Fix:** Removed the composite project reference setup entirely. Deleted
  `tsconfig.node.json`, made a single `tsconfig.json` that includes both `src`
  and `vite.config.ts`, and changed the build script to
  `tsc --noEmit && vite build`.

### 3. CORS-tainted remote image could blank the live editor

- **Symptom:** Adding a remote image whose host sends no CORS headers taints the
  canvas; the strict B/W pass calls `getImageData`, which then throws on every
  repaint and breaks the preview.
- **Cause:** `applyBW` reads pixels back from a tainted canvas.
- **Fix:** Wrapped the `getImageData` call in `applyBW` in try/catch — on a
  tainted canvas the B/W pass is skipped so the editor keeps working. Export
  still reports a clear error, and the URL importer flags failed loads.

## 2026-06-29 — Phase 2 (dictionary, presets, snap, crop, CI)

### 4. ESLint install blocked by peer dependency conflicts
- **Symptom:** `npm i -D eslint@^9 …` failed with `ERESOLVE`. `@eslint/js`
  floated to `10.x` (peer wants eslint ^10) and `eslint-plugin-react-hooks@4`
  does not support eslint 9.
- **Fix:** Pinned `@eslint/js@^9`, `typescript-eslint@^8`,
  `eslint-plugin-react-hooks@^5`, `eslint-plugin-react-refresh@^0.4`. Install
  then resolved cleanly.

### 5. Lint failures: `prefer-const`
- **Symptom:** ESLint reported `prefer-const` on `let` bindings in
  `applyCrop` (CanvasStage) and the BMP encoder.
- **Fix:** `eslint . --fix`; values were never reassigned so `const` is correct.

### 6. Prettier check failed in CI sequence
- **Symptom:** `format:check` flagged `index.html` and the deploy workflow.
- **Fix:** Ran `prettier --write .` across the repo and added a
  `.prettierignore` (dist, node_modules, package-lock.json).

---

## Template for future entries

```
### <short title>
- **Symptom:** what the user/dev observed.
- **Cause:** root cause.
- **Fix:** what changed.
```
