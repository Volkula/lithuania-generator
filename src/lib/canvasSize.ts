import { DEFAULT_CANVAS_SIZE, EditorState } from "../types";

export interface CanvasDimensions {
  width: number;
  height: number;
}

export const CANVAS_SIZE_PRESETS: { label: string; width: number; height: number }[] =
  [
    { label: "512²", width: 512, height: 512 },
    { label: "1024²", width: 1024, height: 1024 },
    { label: "2048²", width: 2048, height: 2048 },
    { label: "1024×1536", width: 1024, height: 1536 },
    { label: "1536×1024", width: 1536, height: 1024 },
    { label: "1024×2048", width: 1024, height: 2048 },
  ];

export const CANVAS_MIN = 256;
export const CANVAS_MAX = 8192;

export function getCanvasWidth(state: EditorState): number {
  return state.canvasWidth ?? DEFAULT_CANVAS_SIZE;
}

export function getCanvasHeight(state: EditorState): number {
  return state.canvasHeight ?? DEFAULT_CANVAS_SIZE;
}

export function getCanvasDimensions(state: EditorState): CanvasDimensions {
  return { width: getCanvasWidth(state), height: getCanvasHeight(state) };
}

function clampDim(n: number): number {
  return Math.round(Math.min(CANVAS_MAX, Math.max(CANVAS_MIN, n)));
}

function scaleNum(n: number, factor: number): number {
  return Math.round(n * factor);
}

/**
 * Resize the logical canvas and scale every layer / frame metric so the layout
 * is preserved (vector-style — positions and sizes, not raster re-sampling).
 */
export function resizeCanvasState(
  state: EditorState,
  newWidth: number,
  newHeight: number
): EditorState {
  const oldW = getCanvasWidth(state);
  const oldH = getCanvasHeight(state);
  const w = clampDim(newWidth);
  const h = clampDim(newHeight);
  if (w === oldW && h === oldH) return state;

  const sx = w / oldW;
  const sy = h / oldH;
  const fontScale = Math.sqrt(sx * sy);

  return {
    ...state,
    canvasWidth: w,
    canvasHeight: h,
    layers: state.layers.map((layer) => {
      if (layer.type === "text") {
        return {
          ...layer,
          x: scaleNum(layer.x, sx),
          y: scaleNum(layer.y, sy),
          maxWidth: scaleNum(layer.maxWidth, sx),
          fontSize: Math.max(8, scaleNum(layer.fontSize, fontScale)),
          letterSpacing: Math.round(layer.letterSpacing * sx * 10) / 10,
        };
      }
      return {
        ...layer,
        x: scaleNum(layer.x, sx),
        y: scaleNum(layer.y, sy),
        width: Math.max(1, scaleNum(layer.width, sx)),
        height: Math.max(1, scaleNum(layer.height, sy)),
      };
    }),
    frame: {
      ...state.frame,
      thickness: Math.max(1, scaleNum(state.frame.thickness, fontScale)),
      margin: Math.max(0, scaleNum(state.frame.margin, fontScale)),
    },
  };
}
