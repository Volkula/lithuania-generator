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

---

## Template for future entries

```
### <short title>
- **Symptom:** what the user/dev observed.
- **Cause:** root cause.
- **Fix:** what changed.
```
