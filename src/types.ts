export const CANVAS_SIZE = 1024;

export type MonoColor = "#000000" | "#ffffff";

export interface TextLayer {
  id: string;
  type: "text";
  name: string;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  uppercase: boolean;
  align: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing: number;
  color: MonoColor;
  visible: boolean;
}

export interface ImageLayer {
  id: string;
  type: "image";
  name: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  flipX: boolean;
  flipY: boolean;
  rotation: number;
  opacity: number;
  bw: boolean;
  threshold: number;
  invert: boolean;
  visible: boolean;
}

export type Layer = TextLayer | ImageLayer;

export interface BackgroundState {
  src: string | null;
  naturalWidth: number;
  naturalHeight: number;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  visible: boolean;
}

export interface FrameState {
  enabled: boolean;
  exportWithFrame: boolean;
  style: "classic" | "double" | "thin" | "ornate" | "banner";
  thickness: number;
  margin: number;
  color: MonoColor;
}

export interface BWState {
  enabled: boolean;
  threshold: number;
  invert: boolean;
  dither: boolean;
}

export interface EditorState {
  layers: Layer[];
  background: BackgroundState;
  frame: FrameState;
  bw: BWState;
  canvasBg: MonoColor;
  selectedId: string | null;
}

export function createInitialState(): EditorState {
  return {
    layers: [],
    background: {
      src: null,
      naturalWidth: 0,
      naturalHeight: 0,
      cropX: 0,
      cropY: 0,
      cropW: 0,
      cropH: 0,
      visible: true,
    },
    frame: {
      enabled: true,
      exportWithFrame: true,
      style: "classic",
      thickness: 10,
      margin: 28,
      color: "#000000",
    },
    bw: {
      enabled: true,
      threshold: 128,
      invert: false,
      dither: false,
    },
    canvasBg: "#ffffff",
    selectedId: null,
  };
}
