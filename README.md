# Lithania Generator

A browser-based image generator for **Warhammer 40,000 litanies**. Pick a
canonical Imperial litany (or import your own text), compose it over a
background and images, and export a strict **1024×1024 black & white** picture
in several formats. Runs entirely in the browser — no server, no backend.

![strict black & white](public/skull.svg)

## Features

1. **Litany library** — a curated, alphabetically sorted collection of WH40k
   litanies, catechisms, hymns and maxims (in the spirit of the Lexicanum
   _Quotes_ sections), filterable by category and full-text search.
2. **Custom text, dictionary & document import** — add your own text layers, or
   import `.txt` / `.docx` files (`.docx` parsed with
   [mammoth](https://github.com/mwilliamson/mammoth.js), formatting reduced to
   clean line breaks). Build a **personal dictionary** of litanies that is saved
   in the browser (localStorage) and can be **downloaded / uploaded as JSON** —
   your custom entries show up in the Library marked with ★.
3. **Strict 1-bit black & white** — the whole raster is thresholded to pure
   black & white, with adjustable threshold, invert and ordered dithering.
   Export as **PNG, JPEG, WebP, or true 1-bit BMP**.
4. **Background sizing & cropping** — load a background image and define the
   source crop rectangle that is scaled to _cover_ the 1024² canvas. Add a
   decorative **frame** (thin / classic / double / ornate) and choose whether
   it is included in the export.
5. **Image layers** — add any image (file **or remote URL**) and resize, crop,
   flip on either axis, rotate, set opacity, and apply a per-image B/W
   threshold.
6. **Undo / redo** — full history with `Ctrl+Z` / `Ctrl+Y` (and `Ctrl+Shift+Z`).
   `Delete` removes the selected layer.
7. **Runs in the browser, deployed via GitHub Actions** to GitHub Pages.
8. **Imperial banner kit** — an organic **banner/scroll frame** shape, built-in
   **emblems** (skull-and-laurel, winged sword), and a one-click **“Assemble
   Imperial Banner”** that arranges emblems + Cyrillic text + scroll frame like
   the reference. Cyrillic-capable fonts are bundled, and you can **upload your
   own font** (e.g. a Cyrillic Fraktur) via the Text tab.
9. **Iconography library** — **456 WH40k faction / iconography SVGs** (Imperium,
   Chaos, Xenos sub-factions, General) in the **Icons** tab, searchable and
   filterable by category. Click to drop an icon onto the canvas, Shift+Click to
   use it as the background. Assets are vendored under `public/wh40k/` from the
   [seal-generator](https://github.com/Volkula/seal-generator) library and
   indexed by `src/data/iconLibrary.ts`.
10. **Editor conveniences** — drag layers with **snap/alignment guides**
    (centre & edges), **visual mouse cropping** for image layers, one-click
    **layout presets**, **Save / Load project** as JSON, and silent autosave so a
    page reload keeps your work. A wide selection of thematic **Google fonts**
    (Cinzel, Cinzel Decorative, IM Fell English, UnifrakturMaguntia,
    MedievalSharp, Pirata One, Marcellus SC, Metamorphous, …).

## Output

- Canvas is always **1024 × 1024**.
- Conversion is **strict black & white** (1-bit luminance threshold).
- Formats: `PNG`, `JPEG`, `WebP`, and `BMP (1-bit)`.

## Local development

```bash
npm install
npm run dev          # start the dev server (http://localhost:5173)
npm run build        # type-check + production build into dist/
npm run preview      # preview the production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run format       # prettier --write .
npm run format:check # prettier --check .
```

Continuous integration (`.github/workflows/ci.yml`) runs type check, ESLint,
Prettier check and a build on every push and pull request.

## Deployment (GitHub Pages via Actions)

Every push to `main` triggers `.github/workflows/deploy.yml`, which builds the
site and publishes `dist/` to GitHub Pages.

One-time setup in the GitHub repo: **Settings → Pages → Build and deployment →
Source = "GitHub Actions"**.

The site is served from `/lithuania-generator/` (configured as the Vite `base`
for production builds in `vite.config.ts`). If you fork under a different repo
name, update that `base`.

## How it works

- The scene is composed onto a single `<canvas>` (`src/lib/render.ts`).
- An overlay canvas draws the selection box & resize handles, keeping the
  export canvas clean.
- State lives in an undo/redo history (`src/hooks/useHistory.ts`); transient
  drags use `replace` mode so each gesture produces a single history entry.
- Export re-renders into an offscreen 1024² canvas and encodes the chosen
  format (`src/lib/exportImage.ts`), including a hand-written 1-bit BMP encoder.

## Notes & limitations

- **Remote images & CORS**: images added by URL are loaded with
  `crossOrigin="anonymous"`. If the remote host does not send permissive CORS
  headers, the image either fails to load or _taints_ the canvas, which makes
  pixel readback (the B/W pass) and export throw. Workaround: download the
  image and add it as a file. The UI surfaces a warning in this case.
- Fonts `Cinzel` and `IM Fell English` are loaded from Google Fonts for the
  thematic Imperial look.

See [`AGENTS.md`](AGENTS.md) for architecture/contributor notes and
[`FIXLOG.md`](FIXLOG.md) for the running log of bugs and fixes.

## Lore disclaimer

Warhammer 40,000 and all associated names are © Games Workshop. This is a
non-commercial fan tool. Litany texts are well-known community/canon quotes
included for fan use.
