import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CANVAS_SIZE,
  EditorState,
  ImageLayer,
  Layer,
  MonoColor,
  TextLayer,
  createInitialState,
} from "./types";
import { useHistory } from "./hooks/useHistory";
import CanvasStage from "./components/CanvasStage";
import { Field, NumberInput, Section, Slider, Toggle } from "./components/ui";
import { Litany, LITANIES } from "./data/litanies";
import { importFile } from "./lib/importDoc";
import {
  EXPORT_FORMATS,
  ExportFormat,
  downloadBlob,
  exportImage,
} from "./lib/exportImage";
import { clearFailure, getImage, hasFailed } from "./lib/images";
import {
  exportCustomJson,
  loadCustom,
  makeCustomLitany,
  parseImportedJson,
  saveCustom,
} from "./lib/customLibrary";
import {
  loadAutosave,
  parseProject,
  saveAutosave,
  serializeProject,
} from "./lib/project";
import { PRESETS } from "./lib/presets";
import { registerFontFile } from "./lib/fonts";

type Tab = "library" | "text" | "image" | "canvas" | "export";

// Latin display fonts first, then Cyrillic-capable faces (для русского текста).
const FONTS = [
  "Cinzel, serif",
  "'Cinzel Decorative', serif",
  "'IM Fell English', serif",
  "'EB Garamond', serif",
  "'UnifrakturMaguntia', cursive",
  "'MedievalSharp', cursive",
  "'Pirata One', cursive",
  "'Marcellus SC', serif",
  "'Metamorphous', serif",
  "'Ruslan Display', cursive",
  "'Yeseva One', serif",
  "'Forum', serif",
  "'PT Serif', serif",
  "'Old Standard TT', serif",
  "Georgia, serif",
  "'Times New Roman', serif",
  "Arial, sans-serif",
  "'Courier New', monospace",
];

const EMBLEMS = [
  { name: "Skull & Laurel", file: "emblems/skull-laurel.svg" },
  { name: "Winged Sword", file: "emblems/winged-sword.svg" },
];

let counter = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${counter++}`;

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function loadDimensions(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("Could not load image: " + src));
    img.src = src;
  });
}

export default function App() {
  const [initialState] = useState<EditorState>(
    () => loadAutosave() ?? createInitialState()
  );
  const { state, set, undo, redo, reset, canUndo, canRedo } =
    useHistory<EditorState>(initialState);
  const [tab, setTab] = useState<Tab>("library");
  const [category, setCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const [status, setStatus] = useState<string>("");
  const [cropMode, setCropMode] = useState(false);
  const [customFonts, setCustomFonts] = useState<string[]>([]);
  const fonts = useMemo(() => [...FONTS, ...customFonts], [customFonts]);

  // Custom litany dictionary, persisted to localStorage.
  const [custom, setCustom] = useState<Litany[]>(() => loadCustom());
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCategory, setDraftCategory] = useState("Custom");
  const [draftText, setDraftText] = useState("");

  useEffect(() => {
    saveCustom(custom);
  }, [custom]);

  // Debounced autosave of the whole project so reloads keep your work.
  useEffect(() => {
    const t = setTimeout(() => saveAutosave(state), 400);
    return () => clearTimeout(t);
  }, [state]);

  const allLitanies = useMemo(
    () =>
      [...LITANIES, ...custom].sort((a, b) => a.title.localeCompare(b.title)),
    [custom]
  );
  const allCategories = useMemo(
    () =>
      Array.from(new Set(allLitanies.map((l) => l.category))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [allLitanies]
  );

  const selected = state.layers.find((l) => l.id === state.selectedId) ?? null;

  const onSelect = useCallback(
    (id: string | null) => {
      setCropMode(false);
      set((p) => ({ ...p, selectedId: id }), "replace");
    },
    [set]
  );

  const updateLayer = useCallback(
    (
      id: string,
      fn: (l: Layer) => Layer,
      mode: "commit" | "replace" = "commit"
    ) =>
      set(
        (p) => ({
          ...p,
          layers: p.layers.map((l) => (l.id === id ? fn(l) : l)),
        }),
        mode
      ),
    [set]
  );

  const updateText = useCallback(
    (
      id: string,
      patch: Partial<TextLayer>,
      mode: "commit" | "replace" = "commit"
    ) =>
      updateLayer(
        id,
        (l) => (l.type === "text" ? { ...l, ...patch } : l),
        mode
      ),
    [updateLayer]
  );

  const updateImage = useCallback(
    (
      id: string,
      patch: Partial<ImageLayer>,
      mode: "commit" | "replace" = "commit"
    ) =>
      updateLayer(
        id,
        (l) => (l.type === "image" ? { ...l, ...patch } : l),
        mode
      ),
    [updateLayer]
  );

  const addTextLayer = useCallback(
    (text: string, name: string) => {
      const layer: TextLayer = {
        id: uid("text"),
        type: "text",
        name,
        text,
        x: CANVAS_SIZE / 2,
        y: 150,
        maxWidth: 800,
        fontFamily: FONTS[0],
        fontSize: 42,
        fontWeight: 600,
        italic: false,
        uppercase: false,
        align: "center",
        lineHeight: 1.32,
        letterSpacing: 0,
        color: "#000000",
        visible: true,
      };
      set((p) => ({
        ...p,
        layers: [...p.layers, layer],
        selectedId: layer.id,
      }));
      setTab("text");
    },
    [set]
  );

  const addImageFromSrc = useCallback(
    async (
      src: string,
      name: string,
      opts?: { targetWidth?: number; centerX?: number; centerY?: number }
    ) => {
      try {
        const { w, h } = await loadDimensions(src);
        const maxDim = opts?.targetWidth ?? 520;
        const scale = opts?.targetWidth
          ? maxDim / w
          : Math.min(1, maxDim / Math.max(w, h));
        const width = Math.round(w * scale);
        const height = Math.round(h * scale);
        const centerX = opts?.centerX ?? CANVAS_SIZE / 2;
        const centerY = opts?.centerY ?? CANVAS_SIZE / 2;
        const layer: ImageLayer = {
          id: uid("img"),
          type: "image",
          name,
          src,
          x: Math.round(centerX - width / 2),
          y: Math.round(centerY - height / 2),
          width,
          height,
          naturalWidth: w,
          naturalHeight: h,
          cropX: 0,
          cropY: 0,
          cropW: w,
          cropH: h,
          flipX: false,
          flipY: false,
          rotation: 0,
          opacity: 1,
          bw: false,
          threshold: 128,
          invert: false,
          visible: true,
        };
        getImage(src);
        set((p) => ({
          ...p,
          layers: [...p.layers, layer],
          selectedId: layer.id,
        }));
        setStatus(`Added image "${name}".`);
      } catch (e) {
        setStatus(
          `Failed to load image. If it is a remote URL it may block cross-origin access. (${(e as Error).message})`
        );
      }
    },
    [set]
  );

  const setBackgroundFromSrc = useCallback(
    async (src: string) => {
      try {
        const { w, h } = await loadDimensions(src);
        getImage(src);
        set((p) => ({
          ...p,
          background: {
            src,
            naturalWidth: w,
            naturalHeight: h,
            cropX: 0,
            cropY: 0,
            cropW: w,
            cropH: h,
            visible: true,
          },
        }));
        setStatus("Background set.");
      } catch (e) {
        setStatus(`Failed to load background. (${(e as Error).message})`);
      }
    },
    [set]
  );

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    set((p) => ({
      ...p,
      layers: p.layers.filter((l) => l.id !== selected.id),
      selectedId: null,
    }));
  }, [selected, set]);

  const reorder = useCallback(
    (id: string, dir: -1 | 1) => {
      set((p) => {
        const idx = p.layers.findIndex((l) => l.id === id);
        if (idx < 0) return p;
        const ni = idx + dir;
        if (ni < 0 || ni >= p.layers.length) return p;
        const layers = [...p.layers];
        const [item] = layers.splice(idx, 1);
        layers.splice(ni, 0, item);
        return { ...p, layers };
      });
    },
    [set]
  );

  const duplicateSelected = useCallback(() => {
    if (!selected) return;
    const copy = {
      ...selected,
      id: uid(selected.type),
      x: selected.x + 24,
      y: selected.y + 24,
    } as Layer;
    set((p) => ({ ...p, layers: [...p.layers, copy], selectedId: copy.id }));
  }, [selected, set]);

  // Keyboard shortcuts: undo / redo / delete.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        ctrl &&
        (e.key.toLowerCase() === "y" ||
          (e.key.toLowerCase() === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && !typing) {
        deleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, deleteSelected]);

  const filteredLitanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allLitanies.filter(
      (l) =>
        (category === "All" || l.category === category) &&
        (q === "" ||
          l.title.toLowerCase().includes(q) ||
          l.text.toLowerCase().includes(q))
    );
  }, [allLitanies, category, search]);

  const addCustomLitany = useCallback(() => {
    if (!draftText.trim()) {
      setStatus("Custom litany needs some text.");
      return;
    }
    const lit = makeCustomLitany({
      title: draftTitle,
      category: draftCategory,
      text: draftText,
    });
    setCustom((c) => [...c, lit]);
    setDraftTitle("");
    setDraftText("");
    setStatus(`Saved "${lit.title}" to your dictionary.`);
  }, [draftTitle, draftCategory, draftText]);

  const deleteCustomLitany = useCallback((id: string) => {
    setCustom((c) => c.filter((l) => l.id !== id));
  }, []);

  const handleExportDictionary = useCallback(() => {
    if (custom.length === 0) {
      setStatus("Your dictionary is empty.");
      return;
    }
    const blob = new Blob([exportCustomJson(custom)], {
      type: "application/json",
    });
    downloadBlob(blob, "litany-dictionary.json");
  }, [custom]);

  const handleImportDictionary = useCallback(async (file: File) => {
    try {
      const raw = await file.text();
      const imported = parseImportedJson(raw);
      setCustom((c) => {
        const ids = new Set(c.map((l) => l.id));
        const merged = [...c];
        for (const l of imported) {
          merged.push(ids.has(l.id) ? { ...l, id: `${l.id}-imp` } : l);
        }
        return merged;
      });
      setStatus(`Imported ${imported.length} litanies into your dictionary.`);
    } catch (e) {
      setStatus(`Dictionary import failed: ${(e as Error).message}`);
    }
  }, []);

  const handleSaveProject = useCallback(() => {
    const blob = new Blob([serializeProject(state)], {
      type: "application/json",
    });
    downloadBlob(blob, "litany-project.json");
  }, [state]);

  const handleLoadProject = useCallback(
    async (file: File) => {
      try {
        const raw = await file.text();
        reset(parseProject(raw));
        setStatus(`Loaded project "${file.name}".`);
      } catch (e) {
        setStatus(`Project load failed: ${(e as Error).message}`);
      }
    },
    [reset]
  );

  const handleFontUpload = useCallback(
    async (file: File) => {
      try {
        const { value } = await registerFontFile(file);
        setCustomFonts((c) => (c.includes(value) ? c : [...c, value]));
        // Trigger a repaint now that the face is available.
        set((p) => ({ ...p }), "replace");
        setStatus(
          `Font "${value}" ready. Pick it in a text layer's Font list.`
        );
      } catch (e) {
        setStatus(`Font load failed: ${(e as Error).message}`);
      }
    },
    [set]
  );

  const emblemUrl = (file: string) => `${import.meta.env.BASE_URL}${file}`;

  const buildImperialBanner = useCallback(async () => {
    set((p) => ({
      ...p,
      canvasBg: "#ffffff",
      bw: { ...p.bw, enabled: true, invert: false },
      frame: {
        ...p.frame,
        enabled: true,
        exportWithFrame: true,
        style: "banner",
        color: "#000000",
        thickness: 8,
        margin: 60,
      },
      layers: p.layers.map((l) =>
        l.type === "text"
          ? {
              ...l,
              fontFamily: "'Ruslan Display', cursive",
              align: "center",
              color: "#000000",
              x: CANVAS_SIZE / 2,
              y: 360,
              maxWidth: 560,
              fontSize: 30,
              lineHeight: 1.3,
            }
          : l
      ),
    }));
    await addImageFromSrc(emblemUrl(EMBLEMS[0].file), "Skull & Laurel", {
      targetWidth: 300,
      centerX: CANVAS_SIZE / 2,
      centerY: 210,
    });
    await addImageFromSrc(emblemUrl(EMBLEMS[1].file), "Winged Sword", {
      targetWidth: 300,
      centerX: CANVAS_SIZE / 2,
      centerY: 820,
    });
    setStatus("Imperial banner assembled. Tweak text & emblems as needed.");
  }, [addImageFromSrc, set]);

  async function handleFileImport(file: File) {
    try {
      const { text } = await importFile(file);
      addTextLayer(text, file.name.replace(/\.[^.]+$/, ""));
      setStatus(`Imported "${file.name}".`);
    } catch (e) {
      setStatus(`Import failed: ${(e as Error).message}`);
    }
  }

  async function handleExport() {
    try {
      setStatus("Rendering…");
      const blob = await exportImage(state, exportFormat);
      const ext = EXPORT_FORMATS.find((f) => f.id === exportFormat)!.ext;
      downloadBlob(blob, `litany-1024.${ext}`);
      setStatus(`Exported ${exportFormat.toUpperCase()}.`);
    } catch (e) {
      setStatus(
        `Export failed — a remote image may have tainted the canvas. (${(e as Error).message})`
      );
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img
            src={`${import.meta.env.BASE_URL}skull.svg`}
            alt=""
            width={26}
            height={26}
          />
          <span>Lithania Generator</span>
        </div>
        <div className="toolbar">
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            ↶ Undo
          </button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">
            ↷ Redo
          </button>
          <button
            onClick={() => {
              if (confirm("Clear the whole canvas?"))
                reset(createInitialState());
            }}
          >
            Reset
          </button>
          <button onClick={handleSaveProject} title="Save project as .json">
            Save
          </button>
          <label className="file-btn" title="Load project .json">
            Load
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleLoadProject(f);
                e.target.value = "";
              }}
            />
          </label>
          <span className="spacer" />
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
          >
            {EXPORT_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <button className="primary" onClick={handleExport}>
            Export ⬇
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <nav className="tabs">
            {(["library", "text", "image", "canvas", "export"] as Tab[]).map(
              (t) => (
                <button
                  key={t}
                  className={tab === t ? "active" : ""}
                  onClick={() => setTab(t)}
                >
                  {t === "library"
                    ? "Library"
                    : t === "text"
                      ? "Text"
                      : t === "image"
                        ? "Images"
                        : t === "canvas"
                          ? "Canvas"
                          : "Export"}
                </button>
              )
            )}
          </nav>

          <div className="tab-content">
            {tab === "library" && (
              <Section title="Litany Library">
                <input
                  className="text-input"
                  placeholder="Search litanies…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  className="text-input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="All">All categories</option>
                  {allCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <div className="litany-list">
                  {filteredLitanies.map((l) => {
                    const isCustom = l.id.startsWith("custom-");
                    return (
                      <div key={l.id} className="litany-card">
                        <div className="litany-head">
                          <strong>{l.title}</strong>
                          <span className="tag">
                            {isCustom ? "★ " : ""}
                            {l.category}
                          </span>
                        </div>
                        <p className="litany-text">{l.text}</p>
                        <div className="litany-actions">
                          <button onClick={() => addTextLayer(l.text, l.title)}>
                            + Add to canvas
                          </button>
                          {isCustom ? (
                            <button
                              className="danger"
                              onClick={() => deleteCustomLitany(l.id)}
                            >
                              Delete
                            </button>
                          ) : (
                            <span className="source">{l.source}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {filteredLitanies.length === 0 && (
                    <p className="muted">No litanies match your search.</p>
                  )}
                </div>
              </Section>
            )}

            {tab === "text" && (
              <Section title="Custom Text & Import">
                <button
                  className="block-btn"
                  onClick={() =>
                    addTextLayer("ENTER YOUR LITANY", "Custom text")
                  }
                >
                  + Add empty text layer
                </button>
                <Field label="Import .txt / .docx (keeps line breaks)">
                  <input
                    type="file"
                    accept=".txt,.md,.docx,text/plain"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileImport(f);
                      e.target.value = "";
                    }}
                  />
                </Field>
                <Field
                  label="Upload a font (.ttf/.otf/.woff) — e.g. Cyrillic gothic"
                  hint="Registered for this session; then choose it in a text layer's Font list."
                >
                  <input
                    type="file"
                    accept=".ttf,.otf,.woff,.woff2,font/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFontUpload(f);
                      e.target.value = "";
                    }}
                  />
                </Field>
                <p className="muted">
                  Select a text layer on the canvas to edit its content and
                  style in the right panel.
                </p>
                <hr />
                <h4 className="subhead">
                  Your dictionary (saved in this browser)
                </h4>
                <Field label="Title">
                  <input
                    className="text-input"
                    value={draftTitle}
                    placeholder="e.g. Litany of my Chapter"
                    onChange={(e) => setDraftTitle(e.target.value)}
                  />
                </Field>
                <Field label="Category">
                  <input
                    className="text-input"
                    value={draftCategory}
                    onChange={(e) => setDraftCategory(e.target.value)}
                  />
                </Field>
                <Field label="Text">
                  <textarea
                    className="text-area"
                    rows={5}
                    value={draftText}
                    placeholder="Type your litany…"
                    onChange={(e) => setDraftText(e.target.value)}
                  />
                </Field>
                <button className="block-btn" onClick={addCustomLitany}>
                  + Save to dictionary
                </button>
                <div className="row">
                  <button onClick={handleExportDictionary}>
                    ⬇ Download dictionary
                  </button>
                  <label className="file-btn">
                    ⬆ Upload dictionary
                    <input
                      type="file"
                      accept="application/json,.json"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImportDictionary(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <p className="muted">
                  {custom.length} custom litan
                  {custom.length === 1 ? "y" : "ies"} stored. They appear in the
                  Library tab marked with ★.
                </p>
              </Section>
            )}

            {tab === "image" && (
              <Section title="Add Images">
                <Field label="From file">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        const src = await readFileAsDataURL(f);
                        addImageFromSrc(src, f.name);
                      }
                      e.target.value = "";
                    }}
                  />
                </Field>
                <Field label="From URL (host must allow CORS)">
                  <div className="row">
                    <input
                      className="text-input"
                      placeholder="https://…/image.png"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                    />
                    <button
                      onClick={() => {
                        if (imageUrl.trim()) {
                          clearFailure(imageUrl.trim());
                          addImageFromSrc(imageUrl.trim(), "URL image");
                          setImageUrl("");
                        }
                      }}
                    >
                      Add
                    </button>
                  </div>
                </Field>
                <hr />
                <Field label="Background image (from file)">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        const src = await readFileAsDataURL(f);
                        setBackgroundFromSrc(src);
                      }
                      e.target.value = "";
                    }}
                  />
                </Field>
                <Field label="Background from URL">
                  <button
                    onClick={() => {
                      if (imageUrl.trim()) {
                        setBackgroundFromSrc(imageUrl.trim());
                        setImageUrl("");
                      }
                    }}
                  >
                    Use URL above as background
                  </button>
                </Field>
                <hr />
                <h4 className="subhead">Imperial decorations</h4>
                <div className="preset-grid">
                  {EMBLEMS.map((em) => (
                    <button
                      key={em.file}
                      onClick={() =>
                        addImageFromSrc(emblemUrl(em.file), em.name)
                      }
                    >
                      + {em.name}
                    </button>
                  ))}
                  <button className="primary" onClick={buildImperialBanner}>
                    ⚜ Assemble Imperial Banner
                  </button>
                </div>
                <p className="muted">
                  «Assemble Imperial Banner» sets the scroll frame, a Cyrillic
                  font on your text, and adds both emblems — like the reference.
                </p>
              </Section>
            )}

            {tab === "canvas" && (
              <>
                <Section title="Layout presets">
                  <div className="preset-grid">
                    {PRESETS.map((pr) => (
                      <button
                        key={pr.id}
                        onClick={() => set((p) => pr.apply(p))}
                      >
                        {pr.name}
                      </button>
                    ))}
                  </div>
                </Section>
                <CanvasControls state={state} set={set} />
              </>
            )}

            {tab === "export" && (
              <Section title="Export">
                <Field label="Format">
                  <select
                    className="text-input"
                    value={exportFormat}
                    onChange={(e) =>
                      setExportFormat(e.target.value as ExportFormat)
                    }
                  >
                    {EXPORT_FORMATS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Toggle
                  label="Include frame in export"
                  checked={state.frame.exportWithFrame}
                  onChange={(v) =>
                    set((p) => ({
                      ...p,
                      frame: { ...p.frame, exportWithFrame: v },
                    }))
                  }
                />
                <button className="primary block-btn" onClick={handleExport}>
                  Export 1024×1024 ⬇
                </button>
                <p className="muted">
                  Output is always {CANVAS_SIZE}×{CANVAS_SIZE}. The BMP option
                  is true 1-bit black &amp; white.
                </p>
              </Section>
            )}
          </div>
        </aside>

        <main className="canvas-area">
          <CanvasStage
            state={state}
            setState={set}
            onSelect={onSelect}
            cropMode={cropMode}
          />
          {status && <div className="status">{status}</div>}
        </main>

        <aside className="rail">
          <Section title="Layers">
            <div className="layer-list">
              {[...state.layers].reverse().map((l) => (
                <div
                  key={l.id}
                  className={`layer-item ${
                    l.id === state.selectedId ? "selected" : ""
                  }`}
                  onClick={() => onSelect(l.id)}
                >
                  <button
                    className="visbtn"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateLayer(l.id, (x) => ({ ...x, visible: !x.visible }));
                    }}
                    title="Toggle visibility"
                  >
                    {l.visible ? "👁" : "—"}
                  </button>
                  <span className="layer-name">
                    {l.type === "text" ? "T" : "🖼"} {l.name}
                  </span>
                  <span className="layer-ord">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        reorder(l.id, 1);
                      }}
                    >
                      ▲
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        reorder(l.id, -1);
                      }}
                    >
                      ▼
                    </button>
                  </span>
                </div>
              ))}
              {state.layers.length === 0 && (
                <p className="muted">No layers yet. Add a litany or image.</p>
              )}
            </div>
          </Section>

          {selected && (
            <Section title={`Properties — ${selected.name}`}>
              <div className="prop-actions">
                <button onClick={duplicateSelected}>Duplicate</button>
                <button onClick={deleteSelected} className="danger">
                  Delete
                </button>
              </div>
              {selected.type === "text" ? (
                <TextProperties
                  layer={selected}
                  fonts={fonts}
                  update={(patch, mode) => updateText(selected.id, patch, mode)}
                />
              ) : (
                <ImageProperties
                  layer={selected}
                  update={(patch, mode) =>
                    updateImage(selected.id, patch, mode)
                  }
                  cropMode={cropMode}
                  setCropMode={setCropMode}
                />
              )}
            </Section>
          )}
        </aside>
      </div>
    </div>
  );
}

function CanvasControls({
  state,
  set,
}: {
  state: EditorState;
  set: (u: (p: EditorState) => EditorState, m?: "commit" | "replace") => void;
}) {
  const bg = state.background;
  const f = state.frame;
  const bw = state.bw;
  return (
    <>
      <Section title="Strict Black & White">
        <Toggle
          label="Enable 1-bit B/W conversion"
          checked={bw.enabled}
          onChange={(v) => set((p) => ({ ...p, bw: { ...p.bw, enabled: v } }))}
        />
        <Field label="Threshold">
          <Slider
            min={0}
            max={255}
            value={bw.threshold}
            onStart={() => set((p) => ({ ...p }))}
            onChange={(v) =>
              set((p) => ({ ...p, bw: { ...p.bw, threshold: v } }), "replace")
            }
          />
        </Field>
        <Toggle
          label="Invert"
          checked={bw.invert}
          onChange={(v) => set((p) => ({ ...p, bw: { ...p.bw, invert: v } }))}
        />
        <Toggle
          label="Ordered dithering"
          checked={bw.dither}
          onChange={(v) => set((p) => ({ ...p, bw: { ...p.bw, dither: v } }))}
        />
        <Field label="Base canvas colour">
          <div className="row">
            <button
              className={state.canvasBg === "#ffffff" ? "active" : ""}
              onClick={() => set((p) => ({ ...p, canvasBg: "#ffffff" }))}
            >
              White
            </button>
            <button
              className={state.canvasBg === "#000000" ? "active" : ""}
              onClick={() => set((p) => ({ ...p, canvasBg: "#000000" }))}
            >
              Black
            </button>
          </div>
        </Field>
      </Section>

      <Section title="Background Crop & Size">
        {bg.src ? (
          <>
            <p className="muted">
              Source {bg.naturalWidth}×{bg.naturalHeight}px. Crop region (in
              source pixels) is scaled to cover the 1024² canvas.
            </p>
            <div className="grid2">
              <Field label="Crop X">
                <NumberInput
                  value={bg.cropX}
                  min={0}
                  max={bg.naturalWidth}
                  onChange={(v) =>
                    set((p) => ({
                      ...p,
                      background: { ...p.background, cropX: v },
                    }))
                  }
                />
              </Field>
              <Field label="Crop Y">
                <NumberInput
                  value={bg.cropY}
                  min={0}
                  max={bg.naturalHeight}
                  onChange={(v) =>
                    set((p) => ({
                      ...p,
                      background: { ...p.background, cropY: v },
                    }))
                  }
                />
              </Field>
              <Field label="Crop W">
                <NumberInput
                  value={bg.cropW}
                  min={1}
                  max={bg.naturalWidth}
                  onChange={(v) =>
                    set((p) => ({
                      ...p,
                      background: { ...p.background, cropW: v },
                    }))
                  }
                />
              </Field>
              <Field label="Crop H">
                <NumberInput
                  value={bg.cropH}
                  min={1}
                  max={bg.naturalHeight}
                  onChange={(v) =>
                    set((p) => ({
                      ...p,
                      background: { ...p.background, cropH: v },
                    }))
                  }
                />
              </Field>
            </div>
            <div className="row">
              <button
                onClick={() =>
                  set((p) => ({
                    ...p,
                    background: {
                      ...p.background,
                      cropX: 0,
                      cropY: 0,
                      cropW: p.background.naturalWidth,
                      cropH: p.background.naturalHeight,
                    },
                  }))
                }
              >
                Reset crop
              </button>
              <button
                className="danger"
                onClick={() =>
                  set((p) => ({
                    ...p,
                    background: { ...p.background, src: null },
                  }))
                }
              >
                Remove
              </button>
            </div>
          </>
        ) : (
          <p className="muted">
            No background set. Add one from the Images tab.
          </p>
        )}
      </Section>

      <Section title="Frame">
        <Toggle
          label="Show frame"
          checked={f.enabled}
          onChange={(v) =>
            set((p) => ({ ...p, frame: { ...p.frame, enabled: v } }))
          }
        />
        <Toggle
          label="Export with frame"
          checked={f.exportWithFrame}
          onChange={(v) =>
            set((p) => ({ ...p, frame: { ...p.frame, exportWithFrame: v } }))
          }
        />
        <Field label="Style">
          <select
            className="text-input"
            value={f.style}
            onChange={(e) =>
              set((p) => ({
                ...p,
                frame: { ...p.frame, style: e.target.value as typeof f.style },
              }))
            }
          >
            <option value="thin">Thin</option>
            <option value="classic">Classic</option>
            <option value="double">Double</option>
            <option value="ornate">Ornate (studs)</option>
            <option value="banner">Banner / scroll</option>
          </select>
        </Field>
        <Field label="Thickness">
          <Slider
            min={1}
            max={40}
            value={f.thickness}
            onStart={() => set((p) => ({ ...p }))}
            onChange={(v) =>
              set(
                (p) => ({ ...p, frame: { ...p.frame, thickness: v } }),
                "replace"
              )
            }
          />
        </Field>
        <Field label="Margin">
          <Slider
            min={0}
            max={120}
            value={f.margin}
            onStart={() => set((p) => ({ ...p }))}
            onChange={(v) =>
              set(
                (p) => ({ ...p, frame: { ...p.frame, margin: v } }),
                "replace"
              )
            }
          />
        </Field>
        <Field label="Frame colour">
          <div className="row">
            <button
              className={f.color === "#000000" ? "active" : ""}
              onClick={() =>
                set((p) => ({ ...p, frame: { ...p.frame, color: "#000000" } }))
              }
            >
              Black
            </button>
            <button
              className={f.color === "#ffffff" ? "active" : ""}
              onClick={() =>
                set((p) => ({ ...p, frame: { ...p.frame, color: "#ffffff" } }))
              }
            >
              White
            </button>
          </div>
        </Field>
      </Section>
    </>
  );
}

function TextProperties({
  layer,
  fonts,
  update,
}: {
  layer: TextLayer;
  fonts: string[];
  update: (patch: Partial<TextLayer>, mode?: "commit" | "replace") => void;
}) {
  return (
    <>
      <Field label="Text">
        <textarea
          className="text-area"
          rows={6}
          value={layer.text}
          onChange={(e) => update({ text: e.target.value }, "replace")}
          onBlur={(e) => update({ text: e.target.value })}
        />
      </Field>
      <Field label="Font">
        <select
          className="text-input"
          value={layer.fontFamily}
          onChange={(e) => update({ fontFamily: e.target.value })}
        >
          {fonts.map((ff) => (
            <option key={ff} value={ff}>
              {ff.split(",")[0].replace(/'/g, "")}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid2">
        <Field label="Size">
          <NumberInput
            value={layer.fontSize}
            min={8}
            max={300}
            onChange={(v) => update({ fontSize: v })}
          />
        </Field>
        <Field label="Weight">
          <select
            className="text-input"
            value={layer.fontWeight}
            onChange={(e) => update({ fontWeight: Number(e.target.value) })}
          >
            {[300, 400, 500, 600, 700, 800, 900].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Line height">
          <NumberInput
            value={layer.lineHeight}
            min={0.8}
            max={3}
            step={0.05}
            onChange={(v) => update({ lineHeight: v })}
          />
        </Field>
        <Field label="Letter spacing">
          <NumberInput
            value={layer.letterSpacing}
            min={-5}
            max={40}
            step={0.5}
            onChange={(v) => update({ letterSpacing: v })}
          />
        </Field>
        <Field label="Max width">
          <NumberInput
            value={layer.maxWidth}
            min={40}
            max={CANVAS_SIZE}
            onChange={(v) => update({ maxWidth: v })}
          />
        </Field>
        <Field label="Align">
          <select
            className="text-input"
            value={layer.align}
            onChange={(e) =>
              update({ align: e.target.value as TextLayer["align"] })
            }
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </Field>
        <Field label="X">
          <NumberInput value={layer.x} onChange={(v) => update({ x: v })} />
        </Field>
        <Field label="Y">
          <NumberInput value={layer.y} onChange={(v) => update({ y: v })} />
        </Field>
      </div>
      <div className="row wrap">
        <Toggle
          label="Italic"
          checked={layer.italic}
          onChange={(v) => update({ italic: v })}
        />
        <Toggle
          label="UPPERCASE"
          checked={layer.uppercase}
          onChange={(v) => update({ uppercase: v })}
        />
      </div>
      <Field label="Colour">
        <div className="row">
          <button
            className={layer.color === "#000000" ? "active" : ""}
            onClick={() => update({ color: "#000000" as MonoColor })}
          >
            Black
          </button>
          <button
            className={layer.color === "#ffffff" ? "active" : ""}
            onClick={() => update({ color: "#ffffff" as MonoColor })}
          >
            White
          </button>
        </div>
      </Field>
    </>
  );
}

function ImageProperties({
  layer,
  update,
  cropMode,
  setCropMode,
}: {
  layer: ImageLayer;
  update: (patch: Partial<ImageLayer>, mode?: "commit" | "replace") => void;
  cropMode: boolean;
  setCropMode: (v: boolean) => void;
}) {
  const failed = hasFailed(layer.src);
  return (
    <>
      {failed && (
        <p className="warn">
          This image failed to load (likely CORS-blocked). Try downloading it
          and uploading as a file.
        </p>
      )}
      <button
        className={`block-btn ${cropMode ? "active" : ""}`}
        onClick={() => setCropMode(!cropMode)}
      >
        {cropMode ? "✓ Cropping — drag the box on canvas" : "✂ Crop on canvas"}
      </button>
      <div className="grid2">
        <Field label="Width">
          <NumberInput
            value={layer.width}
            min={1}
            onChange={(v) => update({ width: v })}
          />
        </Field>
        <Field label="Height">
          <NumberInput
            value={layer.height}
            min={1}
            onChange={(v) => update({ height: v })}
          />
        </Field>
        <Field label="X">
          <NumberInput value={layer.x} onChange={(v) => update({ x: v })} />
        </Field>
        <Field label="Y">
          <NumberInput value={layer.y} onChange={(v) => update({ y: v })} />
        </Field>
        <Field label="Rotation°">
          <NumberInput
            value={layer.rotation}
            min={-360}
            max={360}
            onChange={(v) => update({ rotation: v })}
          />
        </Field>
        <Field label="Opacity">
          <NumberInput
            value={layer.opacity}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => update({ opacity: v })}
          />
        </Field>
      </div>
      <div className="row">
        <button onClick={() => update({ flipX: !layer.flipX })}>
          Flip ↔ {layer.flipX ? "on" : "off"}
        </button>
        <button onClick={() => update({ flipY: !layer.flipY })}>
          Flip ↕ {layer.flipY ? "on" : "off"}
        </button>
        <button
          onClick={() => {
            const ratio = layer.naturalHeight / layer.naturalWidth;
            update({ height: Math.round(layer.width * ratio) });
          }}
        >
          Fix aspect
        </button>
      </div>

      <h4 className="subhead">Crop (source pixels)</h4>
      <div className="grid2">
        <Field label="Crop X">
          <NumberInput
            value={layer.cropX}
            min={0}
            max={layer.naturalWidth}
            onChange={(v) => update({ cropX: v })}
          />
        </Field>
        <Field label="Crop Y">
          <NumberInput
            value={layer.cropY}
            min={0}
            max={layer.naturalHeight}
            onChange={(v) => update({ cropY: v })}
          />
        </Field>
        <Field label="Crop W">
          <NumberInput
            value={layer.cropW}
            min={1}
            max={layer.naturalWidth}
            onChange={(v) => update({ cropW: v })}
          />
        </Field>
        <Field label="Crop H">
          <NumberInput
            value={layer.cropH}
            min={1}
            max={layer.naturalHeight}
            onChange={(v) => update({ cropH: v })}
          />
        </Field>
      </div>
      <button
        onClick={() =>
          update({
            cropX: 0,
            cropY: 0,
            cropW: layer.naturalWidth,
            cropH: layer.naturalHeight,
          })
        }
      >
        Reset crop
      </button>

      <h4 className="subhead">Per-image B/W</h4>
      <Toggle
        label="Threshold this image to pure B/W"
        checked={layer.bw}
        onChange={(v) => update({ bw: v })}
      />
      {layer.bw && (
        <>
          <Field label="Threshold">
            <Slider
              min={0}
              max={255}
              value={layer.threshold}
              onStart={() => update({})}
              onChange={(v) => update({ threshold: v }, "replace")}
            />
          </Field>
          <Toggle
            label="Invert"
            checked={layer.invert}
            onChange={(v) => update({ invert: v })}
          />
        </>
      )}
    </>
  );
}
