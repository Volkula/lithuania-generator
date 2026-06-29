import { useMemo, useState } from "react";
import { ICON_CATEGORIES, ICON_LIBRARY } from "../data/iconLibrary";
import { iconUrl } from "../lib/icons";

interface Props {
  onAdd: (file: string, label: string) => void;
  onBackground: (file: string) => void;
}

const PAGE = 90;

export default function IconLibrary({ onAdd, onBackground }: Props) {
  const [category, setCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ICON_LIBRARY.filter(
      (i) =>
        (category === "All" || i.category === category) &&
        (q === "" ||
          i.label.toLowerCase().includes(q) ||
          i.name.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q)))
    );
  }, [category, search]);

  const shown = filtered.slice(0, limit);

  return (
    <div className="section">
      <h3 className="section-title">
        Iconography Library ({ICON_LIBRARY.length})
      </h3>
      <input
        className="text-input"
        placeholder="Search icons (name, faction, keyword)…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setLimit(PAGE);
        }}
      />
      <select
        className="text-input"
        value={category}
        onChange={(e) => {
          setCategory(e.target.value);
          setLimit(PAGE);
        }}
      >
        <option value="All">All categories ({ICON_LIBRARY.length})</option>
        {ICON_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c} ({ICON_LIBRARY.filter((i) => i.category === c).length})
          </option>
        ))}
      </select>

      <div className="icon-grid">
        {shown.map((icon) => (
          <button
            key={icon.file}
            className="icon-tile"
            title={`${icon.label}\n${icon.category}\nClick: add · Shift+Click: set as background`}
            onClick={(e) =>
              e.shiftKey
                ? onBackground(icon.file)
                : onAdd(icon.file, icon.label)
            }
          >
            <img src={iconUrl(icon.file)} alt={icon.label} loading="lazy" />
            <span className="icon-label">{icon.label}</span>
          </button>
        ))}
      </div>

      {filtered.length > shown.length && (
        <button className="block-btn" onClick={() => setLimit((l) => l + PAGE)}>
          Show more ({filtered.length - shown.length} left)
        </button>
      )}
      {filtered.length === 0 && (
        <p className="muted">No icons match your search.</p>
      )}
      <p className="muted">
        Click adds the icon to the canvas; Shift+Click sets it as the
        background.
      </p>
    </div>
  );
}
