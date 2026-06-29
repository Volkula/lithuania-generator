import { useEffect, useMemo, useState } from "react";
import { QuotesDatabase } from "../data/quoteTypes";
import { Section } from "./ui";

const PAGE_SIZE = 40;

interface Props {
  onAdd: (text: string, title: string) => void;
}

export default function QuotesCatalog({ onAdd }: Props) {
  const [db, setDb] = useState<QuotesDatabase | null>(null);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [faction, setFaction] = useState("All");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}quotes.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: QuotesDatabase) => {
        if (!cancelled) setDb(data);
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const quotes = useMemo(() => db?.quotes ?? [], [db]);

  const factionCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of quotes) m.set(q.faction, (m.get(q.faction) ?? 0) + 1);
    return m;
  }, [quotes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotes.filter(
      (quote) =>
        (faction === "All" || quote.faction === faction) &&
        (q === "" ||
          quote.text.toLowerCase().includes(q) ||
          quote.speaker.toLowerCase().includes(q) ||
          quote.source.toLowerCase().includes(q) ||
          quote.faction.toLowerCase().includes(q))
    );
  }, [quotes, search, faction]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE
  );

  if (loadError) {
    return (
      <Section title="Quotes Catalog">
        <p className="warn">Failed to load quotes.json: {loadError}</p>
      </Section>
    );
  }

  if (!db) {
    return (
      <Section title="Quotes Catalog">
        <p className="muted">Loading Lexicanum quotes…</p>
      </Section>
    );
  }

  return (
    <Section title={`Quotes Catalog · ${db.count}`}>
      <input
        className="text-input"
        placeholder="Search quotes, speakers, sources, factions…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
        }}
      />
      <select
        className="text-input"
        value={faction}
        onChange={(e) => {
          setFaction(e.target.value);
          setPage(0);
        }}
      >
        <option value="All">All factions ({db.count})</option>
        {db.factions.map((f) => (
          <option key={f} value={f}>
            {f} ({factionCounts.get(f) ?? 0})
          </option>
        ))}
      </select>

      <p className="muted">
        {filtered.length} match{filtered.length === 1 ? "" : "es"} · page{" "}
        {safePage + 1}/{pageCount}
      </p>

      <div className="litany-list quotes-scroll">
        {pageItems.map((quote) => (
          <div key={quote.id} className="litany-card">
            <div className="litany-head">
              <strong>{quote.speaker || "Unknown"}</strong>
              <span className="tag">{quote.faction}</span>
            </div>
            <p className="litany-text quote-body">{quote.text}</p>
            <div className="litany-actions">
              <button
                onClick={() =>
                  onAdd(quote.text, quote.speaker || quote.faction)
                }
              >
                + Add to canvas
              </button>
              {quote.source && <span className="source">{quote.source}</span>}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="muted">No quotes match your search.</p>
        )}
      </div>

      {pageCount > 1 && (
        <div className="pager">
          <button
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            ← Prev
          </button>
          <span>
            {safePage + 1} / {pageCount}
          </span>
          <button
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            Next →
          </button>
        </div>
      )}
      <p className="muted">
        Full Lexicanum quote pages parsed from quotes_src/*.md. Regenerate with{" "}
        <code>npm run gen:quotes</code>.
      </p>
    </Section>
  );
}
