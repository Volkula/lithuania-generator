import { EditorState } from "../types";
import { getCanvasDimensions } from "./canvasSize";
import { drawScene } from "./render";

export type ExportFormat = "png" | "jpeg" | "webp" | "bmp1";

export const EXPORT_FORMATS: {
  id: ExportFormat;
  label: string;
  ext: string;
}[] = [
  { id: "png", label: "PNG", ext: "png" },
  { id: "jpeg", label: "JPEG", ext: "jpg" },
  { id: "webp", label: "WebP", ext: "webp" },
  { id: "bmp1", label: "BMP (1-bit B/W)", ext: "bmp" },
];

export function renderToCanvas(state: EditorState): HTMLCanvasElement {
  const { width, height } = getCanvasDimensions(state);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  drawScene(ctx, state, { includeFrame: state.frame.exportWithFrame });
  return canvas;
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      mime,
      quality
    );
  });
}

/** Encodes a strict 1-bit (monochrome) Windows BMP from the rendered canvas. */
function encodeBmp1(canvas: HTMLCanvasElement): Blob {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height).data;

  const rowBytes = Math.ceil(width / 8);
  const rowPadded = Math.ceil(rowBytes / 4) * 4;
  const pixelArraySize = rowPadded * height;
  const headerSize = 14 + 40 + 8; // file + info + 2-colour palette
  const fileSize = headerSize + pixelArraySize;

  const buf = new ArrayBuffer(fileSize);
  const dv = new DataView(buf);
  let o = 0;
  // BITMAPFILEHEADER
  dv.setUint8(o++, 0x42);
  dv.setUint8(o++, 0x4d);
  dv.setUint32(o, fileSize, true);
  o += 4;
  dv.setUint32(o, 0, true);
  o += 4;
  dv.setUint32(o, headerSize, true);
  o += 4;
  // BITMAPINFOHEADER
  dv.setUint32(o, 40, true);
  o += 4;
  dv.setInt32(o, width, true);
  o += 4;
  dv.setInt32(o, height, true);
  o += 4; // positive => bottom-up
  dv.setUint16(o, 1, true);
  o += 2;
  dv.setUint16(o, 1, true);
  o += 2; // 1 bit/pixel
  dv.setUint32(o, 0, true);
  o += 4;
  dv.setUint32(o, pixelArraySize, true);
  o += 4;
  dv.setInt32(o, 2835, true);
  o += 4;
  dv.setInt32(o, 2835, true);
  o += 4;
  dv.setUint32(o, 2, true);
  o += 4;
  dv.setUint32(o, 0, true);
  o += 4;
  // palette: index 0 = black, index 1 = white
  dv.setUint32(o, 0x00000000, true);
  o += 4;
  dv.setUint32(o, 0x00ffffff, true);
  o += 4;

  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y; // BMP rows are bottom-up
    const rowStart = o + y * rowPadded;
    for (let x = 0; x < width; x++) {
      const i = (srcY * width + x) * 4;
      const lum = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
      const bit = lum >= 128 ? 1 : 0; // 1 => white
      if (bit) {
        const byteIndex = rowStart + (x >> 3);
        dv.setUint8(byteIndex, dv.getUint8(byteIndex) | (0x80 >> (x & 7)));
      }
    }
  }
  return new Blob([buf], { type: "image/bmp" });
}

export async function exportImage(
  state: EditorState,
  format: ExportFormat
): Promise<Blob> {
  const canvas = renderToCanvas(state);
  switch (format) {
    case "png":
      return canvasToBlob(canvas, "image/png");
    case "jpeg":
      return canvasToBlob(canvas, "image/jpeg", 0.95);
    case "webp":
      return canvasToBlob(canvas, "image/webp", 0.95);
    case "bmp1":
      return encodeBmp1(canvas);
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
