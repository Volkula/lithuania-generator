// Lets the user bring their own font (e.g. a Cyrillic Fraktur/gothic face).
// The font is registered for the current session via the FontFace API and
// returned as a ready-to-use CSS font-family value.

function sanitizeFamily(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  const cleaned = base.replace(/[^\p{L}\p{N}_ -]/gu, " ").trim();
  return cleaned || "Custom Font";
}

export async function registerFontFile(
  file: File
): Promise<{ family: string; value: string }> {
  const buffer = await file.arrayBuffer();
  const family = sanitizeFamily(file.name);
  const face = new FontFace(family, buffer);
  await face.load();
  document.fonts.add(face);
  return { family, value: `'${family}', serif` };
}
