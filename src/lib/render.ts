import {
  BWState,
  EditorState,
  ImageLayer,
  Layer,
  TextLayer,
} from "../types";
import { getCanvasDimensions } from "./canvasSize";
import { getImage } from "./images";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Luminance-based threshold conversion to strict 1-bit black & white. */
export function applyBW(ctx: CanvasRenderingContext2D, bw: BWState, box: Box) {
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const w = Math.min(ctx.canvas.width - x, Math.ceil(box.w));
  const h = Math.min(ctx.canvas.height - y, Math.ceil(box.h));
  if (w <= 0 || h <= 0) return;

  let data: ImageData;
  try {
    data = ctx.getImageData(x, y, w, h);
  } catch {
    // Canvas is tainted by a cross-origin image without CORS headers.
    // Skip the B/W pass so the live editor keeps working; export surfaces
    // a clearer error to the user.
    return;
  }
  const px = data.data;
  // 4x4 Bayer matrix for optional ordered dithering.
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(
    (v) => (v / 16) * 255
  );

  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const i = (row * w + col) * 4;
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      let t = bw.threshold;
      if (bw.dither) {
        const m = bayer[(row % 4) * 4 + (col % 4)];
        t = (bw.threshold + m) / 2 + 64;
      }
      let on = lum >= t ? 255 : 0;
      if (bw.invert) on = 255 - on;
      px[i] = px[i + 1] = px[i + 2] = on;
      // keep alpha as-is so transparent regions stay transparent
    }
  }
  ctx.putImageData(data, x, y);
}

/** "cover" mapping of a source crop rectangle onto the whole canvas. */
function coverRect(
  canvasW: number,
  canvasH: number,
  srcW: number,
  srcH: number
): Box {
  const scale = Math.max(canvasW / srcW, canvasH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (canvasW - w) / 2, y: (canvasH - h) / 2, w, h };
}

function drawBackground(ctx: CanvasRenderingContext2D, state: EditorState) {
  const bg = state.background;
  if (!bg.src || !bg.visible) return;
  const img = getImage(bg.src);
  if (!img) return;
  const { width: canvasW, height: canvasH } = getCanvasDimensions(state);
  const cx = bg.cropW > 0 ? bg.cropX : 0;
  const cy = bg.cropH > 0 ? bg.cropY : 0;
  const cw = bg.cropW > 0 ? bg.cropW : img.naturalWidth;
  const ch = bg.cropH > 0 ? bg.cropH : img.naturalHeight;
  const dest = coverRect(canvasW, canvasH, cw, ch);
  ctx.drawImage(img, cx, cy, cw, ch, dest.x, dest.y, dest.w, dest.h);
}

export function imageLayerBox(layer: ImageLayer): Box {
  return { x: layer.x, y: layer.y, w: layer.width, h: layer.height };
}

function drawImageLayer(ctx: CanvasRenderingContext2D, layer: ImageLayer) {
  if (!layer.visible) return;
  const img = getImage(layer.src);
  if (!img) return;
  const cw = layer.cropW > 0 ? layer.cropW : img.naturalWidth;
  const ch = layer.cropH > 0 ? layer.cropH : img.naturalHeight;

  ctx.save();
  ctx.globalAlpha = layer.opacity;
  const cxCenter = layer.x + layer.width / 2;
  const cyCenter = layer.y + layer.height / 2;
  ctx.translate(cxCenter, cyCenter);
  if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
  ctx.drawImage(
    img,
    layer.cropX,
    layer.cropY,
    cw,
    ch,
    -layer.width / 2,
    -layer.height / 2,
    layer.width,
    layer.height
  );
  ctx.restore();

  if (layer.bw) {
    applyBW(
      ctx,
      {
        enabled: true,
        threshold: layer.threshold,
        invert: layer.invert,
        dither: false,
      },
      imageLayerBox(layer)
    );
  }
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = "";
    for (const word of words) {
      const test = current ? current + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function fontString(layer: TextLayer): string {
  return `${layer.italic ? "italic " : ""}${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;
}

export function measureTextBox(
  ctx: CanvasRenderingContext2D,
  layer: TextLayer
): Box {
  ctx.font = fontString(layer);
  setLetterSpacing(ctx, layer.letterSpacing);
  const content = layer.uppercase ? layer.text.toUpperCase() : layer.text;
  const lines = wrapText(ctx, content, layer.maxWidth);
  const lineH = layer.fontSize * layer.lineHeight;
  const h = lines.length * lineH;
  let w = 0;
  for (const ln of lines) w = Math.max(w, ctx.measureText(ln).width);
  setLetterSpacing(ctx, 0);
  const x =
    layer.align === "center"
      ? layer.x - w / 2
      : layer.align === "right"
        ? layer.x - w
        : layer.x;
  return { x, y: layer.y, w: Math.max(w, 1), h: Math.max(h, lineH) };
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, value: number) {
  // letterSpacing is supported in modern Chromium/Firefox canvas contexts.
  try {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${value}px`;
  } catch {
    /* ignore unsupported */
  }
}

function drawTextLayer(ctx: CanvasRenderingContext2D, layer: TextLayer) {
  if (!layer.visible) return;
  ctx.save();
  ctx.font = fontString(layer);
  ctx.fillStyle = layer.color;
  ctx.textBaseline = "top";
  ctx.textAlign = layer.align;
  setLetterSpacing(ctx, layer.letterSpacing);
  const content = layer.uppercase ? layer.text.toUpperCase() : layer.text;
  const lines = wrapText(ctx, content, layer.maxWidth);
  const lineH = layer.fontSize * layer.lineHeight;
  lines.forEach((ln, i) => {
    ctx.fillText(ln, layer.x, layer.y + i * lineH);
  });
  ctx.restore();
}

export function drawFrame(ctx: CanvasRenderingContext2D, state: EditorState) {
  const f = state.frame;
  const { width: canvasW, height: canvasH } = getCanvasDimensions(state);
  ctx.save();
  ctx.strokeStyle = f.color;
  ctx.fillStyle = f.color;
  const m = f.margin;
  const t = f.thickness;
  const innerW = canvasW - 2 * m;
  const innerH = canvasH - 2 * m;

  const strokeRect = (off: number, thick: number) => {
    ctx.lineWidth = thick;
    ctx.strokeRect(
      m + off + thick / 2,
      m + off + thick / 2,
      innerW - 2 * off - thick,
      innerH - 2 * off - thick
    );
  };

  if (f.style === "banner") {
    drawBannerPath(ctx, m, canvasW, canvasH);
    ctx.lineWidth = t;
    ctx.lineJoin = "round";
    ctx.stroke();
  } else if (f.style === "thin") {
    strokeRect(0, t);
  } else if (f.style === "classic") {
    strokeRect(0, t);
  } else if (f.style === "double") {
    strokeRect(0, t);
    strokeRect(t + 8, Math.max(2, t / 2));
  } else if (f.style === "ornate") {
    strokeRect(0, t);
    strokeRect(t + 10, Math.max(2, t / 3));
    const corners = [
      [m, m],
      [canvasW - m, m],
      [m, canvasH - m],
      [canvasW - m, canvasH - m],
    ];
    for (const [cx, cy] of corners) {
      ctx.beginPath();
      ctx.arc(cx, cy, t * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Organic "luggage-tag" banner outline: rounded top shoulders, near-straight
 * sides, and a softly tapered rounded base — matching the reference scroll.
 */
function drawBannerPath(
  ctx: CanvasRenderingContext2D,
  margin: number,
  canvasW: number,
  canvasH: number
) {
  const left = margin;
  const right = canvasW - margin;
  const top = margin;
  const bottom = canvasH - margin;
  const cx = canvasW / 2;
  const w = right - left;
  const h = bottom - top;

  ctx.beginPath();
  ctx.moveTo(cx, top);
  // right shoulder
  ctx.bezierCurveTo(
    right - w * 0.04,
    top,
    right,
    top + h * 0.1,
    right,
    top + h * 0.2
  );
  // right side (slightly convex)
  ctx.bezierCurveTo(
    right + w * 0.015,
    top + h * 0.38,
    right + w * 0.015,
    top + h * 0.55,
    right - w * 0.01,
    top + h * 0.66
  );
  // taper to bottom centre
  ctx.bezierCurveTo(
    right - w * 0.06,
    bottom - h * 0.12,
    cx + w * 0.2,
    bottom,
    cx,
    bottom
  );
  // mirror: bottom centre to left
  ctx.bezierCurveTo(
    cx - w * 0.2,
    bottom,
    left + w * 0.06,
    bottom - h * 0.12,
    left + w * 0.01,
    top + h * 0.66
  );
  // left side
  ctx.bezierCurveTo(
    left - w * 0.015,
    top + h * 0.55,
    left - w * 0.015,
    top + h * 0.38,
    left,
    top + h * 0.2
  );
  // left shoulder
  ctx.bezierCurveTo(left, top + h * 0.1, left + w * 0.04, top, cx, top);
  ctx.closePath();
}

export interface RenderOptions {
  includeFrame: boolean;
  /** Leave the base canvas transparent (used for asset-pack layer exports). */
  transparent?: boolean;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  state: EditorState,
  opts: RenderOptions
) {
  const { width: canvasW, height: canvasH } = getCanvasDimensions(state);
  ctx.clearRect(0, 0, canvasW, canvasH);
  if (!opts.transparent) {
    ctx.fillStyle = state.canvasBg;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  drawBackground(ctx, state);
  for (const layer of state.layers) {
    if (layer.type === "image") drawImageLayer(ctx, layer);
  }

  if (state.bw.enabled) {
    applyBW(ctx, state.bw, { x: 0, y: 0, w: canvasW, h: canvasH });
  }

  // Text is already pure mono, drawn on top so it stays crisp.
  for (const layer of state.layers) {
    if (layer.type === "text") drawTextLayer(ctx, layer);
  }

  if (state.frame.enabled && opts.includeFrame) {
    drawFrame(ctx, state);
  }
}

export function layerBox(ctx: CanvasRenderingContext2D, layer: Layer): Box {
  if (layer.type === "image") return imageLayerBox(layer);
  return measureTextBox(ctx, layer);
}
