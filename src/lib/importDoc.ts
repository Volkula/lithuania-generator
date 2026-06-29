import mammoth from "mammoth";

export interface ImportedText {
  text: string;
  html: string;
}

function htmlToText(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  // Convert block elements to line breaks to preserve paragraph layout.
  div.querySelectorAll("p, br, div, li, h1, h2, h3, h4").forEach((el) => {
    el.append("\n");
  });
  const text = div.textContent ?? "";
  return text
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/g, ""))
    .join("\n")
    .trim();
}

export async function importFile(file: File): Promise<ImportedText> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return { html: result.value, text: htmlToText(result.value) };
  }
  if (name.endsWith(".doc")) {
    throw new Error(
      "Legacy .doc is not supported in the browser. Please save as .docx or .txt."
    );
  }
  // Plain text (txt, md, anything text-like).
  const text = await file.text();
  const html = text
    .split("\n")
    .map((l) => `<p>${escapeHtml(l)}</p>`)
    .join("");
  return { text: text.replace(/\r\n/g, "\n").trim(), html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
