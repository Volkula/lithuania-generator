/*
 * One-off generator: parses the Lexicanum "*_Quotes" pages saved as markdown
 * in quotes_src/ into a typed dataset at src/data/quotes.ts.
 *
 * The wiki tables are rendered as pipe rows, but column order/count is wildly
 * inconsistent across pages (Speaker|Quote, Tome|Quote|Source, Source|Quote|
 * Notes, collapsed leading cells, etc.). So instead of trusting columns we use
 * a content heuristic per row:
 *   - the QUOTE cell is the one that looks most like a sentence,
 *   - a SOURCE-looking cell (book / codex / pg. citation) becomes the source,
 *   - whatever attribution cell is left becomes the speaker.
 *
 * Usage:  node gen-quotes.cjs
 */
const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "quotes_src");
const OUT_JSON = path.join(__dirname, "public", "quotes.json");

const CITATION_RE =
  /\b(pg\.|pgs\.|p\.|pp\.|ch\.|chapter\b|codex|white dwarf|rulebook|novel\b|edition|audio book|card game|teaser|black library|hammer and bolter|warhammer 40,?000:|magic: the gathering|dawn of war|battlefleet|oldid|short story|anthology|gathering's universes)\b/i;

function clean(s) {
  if (!s) return "";
  return s
    .replace(/\[[^\]\n]*\]/g, "") // citation markers [1], [22a], [Note 1]
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function splitRow(line) {
  const inner = line.replace(/^\s*\|/, "").replace(/\|\s*$/, "");
  return inner.split("|").map((c) => c.trim());
}

function isSeparator(cells) {
  return cells.every((c) => /^:?-{3,}:?$/.test(c) || c === "");
}

function wordCount(s) {
  return s ? s.split(/\s+/).filter(Boolean).length : 0;
}

function isCitation(s) {
  if (!s) return false;
  if (CITATION_RE.test(s) && wordCount(s) <= 18) return true;
  if (/,\s*(pg|pgs|p|pp)\.?\s*\d/i.test(s)) return true;
  return false;
}

// score how much a cell looks like an actual quote sentence
function quoteScore(s) {
  if (!s) return -1000;
  if (isCitation(s)) return -1000;
  let score = wordCount(s);
  if (/[.!?]["']?$/.test(s)) score += 4;
  if (/^[“"A-Z]/.test(s)) score += 1;
  return score;
}

const TITLE_RE =
  /^(Fabricator|Magos|Arch-?magos|Tech-?Priest|Lord|Inquisitor|Captain|Sergeant|Brother|Primarch|General|Commander|Adept|Cryptek|Farseer|Lieutenant|Colonel|Marshal|Warboss|Autarch|Phaeron|Overlord|Canoness)\b/i;

// a cell that is really just a speaker/attribution rather than a quote
function looksLikeName(s) {
  if (/[.!?]["']?$/.test(s)) return false; // ends like a sentence
  return TITLE_RE.test(s) && (/\bof\b/i.test(s) || s.includes(","));
}

// strip trailing in-text attribution ("- to Lord X", "– attributed", etc.)
function stripAttribution(s) {
  let out = s.replace(/^[-–—]\s*/, ""); // leading dialogue dash
  out = out.replace(
    /\s*[-–—]\s*(attributed|to |at |during|before|after|from |spoken|said|circa|in response|upon |when |on the|prior to|during the).*$/i,
    ""
  );
  // a dash-tail that follows a finished sentence is almost always an attribution
  out = out.replace(/([.!?]["'”’]?)\s*[-–—]\s+\S.*$/, "$1");
  return out.trim();
}

const quotes = [];
const seen = new Set();

const files = fs
  .readdirSync(SRC_DIR)
  .filter((f) => f.toLowerCase().endsWith(".md"))
  .sort();

for (const file of files) {
  const faction = file.replace(/\.md$/i, "");
  const lines = fs.readFileSync(path.join(SRC_DIR, file), "utf8").split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    if (!/^\s*\|/.test(lines[i])) {
      i++;
      continue;
    }
    const header = splitRow(lines[i]);
    const next = lines[i + 1] ? splitRow(lines[i + 1]) : null;
    if (!next || !isSeparator(next) || header.length < 2) {
      i++;
      continue;
    }
    if (!header.join(" ").toLowerCase().includes("quote")) {
      i += 2;
      continue;
    }

    let j = i + 2;
    let lastSpeaker = "";
    while (j < lines.length && /^\s*\|/.test(lines[j])) {
      const cells = splitRow(lines[j]).map(clean).filter((c) => c !== "");
      if (cells.length && !isSeparator(cells)) {
        // pick quote = best sentence-looking cell
        let qi = -1;
        let best = -1000;
        cells.forEach((c, idx) => {
          const sc = quoteScore(c);
          if (sc > best) {
            best = sc;
            qi = idx;
          }
        });
        if (qi >= 0 && best > -1000) {
          const rest = cells.filter((_, idx) => idx !== qi);
          const source = rest.find((c) => isCitation(c)) || "";
          const speaker = rest.find((c) => c !== source) || "";
          const text = stripAttribution(cells[qi]);
          if (speaker) lastSpeaker = speaker;
          const finalSpeaker = speaker || lastSpeaker;
          const noPunct = !/[.!?]["'”’]?$/.test(text);
          const bad =
            looksLikeName(text) || (noPunct && wordCount(text) < 6);
          if (text && wordCount(text) >= 2 && !isCitation(text) && !bad) {
            const key = faction + "|" + text.toLowerCase().slice(0, 80);
            if (!seen.has(key)) {
              seen.add(key);
              quotes.push({ faction, speaker: finalSpeaker, text, source });
            }
          }
        }
      }
      j++;
    }
    i = j;
  }
}

quotes.sort(
  (a, b) =>
    a.faction.localeCompare(b.faction) ||
    a.speaker.localeCompare(b.speaker) ||
    a.text.localeCompare(b.text)
);

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const counts = {};
const idCount = {};
const entries = quotes.map((q) => {
  const base = slug(q.faction) + "-" + (slug(q.speaker) || "anon");
  idCount[base] = (idCount[base] || 0) + 1;
  counts[q.faction] = (counts[q.faction] || 0) + 1;
  return { id: base + "-" + idCount[base], ...q };
});

const factions = Array.from(new Set(entries.map((q) => q.faction))).sort((a, b) =>
  a.localeCompare(b)
);

const payload = {
  version: 1,
  count: entries.length,
  factions,
  quotes: entries,
};

fs.writeFileSync(OUT_JSON, JSON.stringify(payload), "utf8");

console.log("Wrote", entries.length, "quotes to", OUT_JSON);
for (const f of factions) console.log("  " + f + ": " + counts[f]);
