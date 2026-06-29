import { CANVAS_SIZE, EditorState, TextLayer } from "../types";

export interface LayoutPreset {
  id: string;
  name: string;
  apply: (state: EditorState) => EditorState;
}

function styleTexts(
  state: EditorState,
  patch: Partial<TextLayer>
): EditorState {
  return {
    ...state,
    layers: state.layers.map((l) =>
      l.type === "text" ? { ...l, ...patch } : l
    ),
  };
}

export const PRESETS: LayoutPreset[] = [
  {
    id: "classic",
    name: "Classic Litany (black on white)",
    apply: (s) => ({
      ...styleTexts(s, {
        color: "#000000",
        align: "center",
        x: CANVAS_SIZE / 2,
        fontFamily: "Cinzel, serif",
        maxWidth: 820,
        uppercase: false,
      }),
      canvasBg: "#ffffff",
      bw: { ...s.bw, enabled: true, invert: false },
      frame: {
        ...s.frame,
        enabled: true,
        exportWithFrame: true,
        style: "classic",
      },
    }),
  },
  {
    id: "inverted",
    name: "Inverted Banner (white on black)",
    apply: (s) => ({
      ...styleTexts(s, {
        color: "#ffffff",
        align: "center",
        x: CANVAS_SIZE / 2,
        fontFamily: "Cinzel, serif",
        maxWidth: 820,
      }),
      canvasBg: "#000000",
      bw: { ...s.bw, enabled: true },
      frame: {
        ...s.frame,
        enabled: true,
        exportWithFrame: true,
        style: "double",
        color: "#ffffff",
      },
    }),
  },
  {
    id: "ornate",
    name: "Ornate Scripture",
    apply: (s) => ({
      ...styleTexts(s, {
        color: "#000000",
        align: "center",
        x: CANVAS_SIZE / 2,
        fontFamily: "'IM Fell English', serif",
        maxWidth: 760,
        lineHeight: 1.4,
      }),
      canvasBg: "#ffffff",
      frame: {
        ...s.frame,
        enabled: true,
        exportWithFrame: true,
        style: "ornate",
        thickness: 12,
        margin: 40,
      },
    }),
  },
  {
    id: "plain",
    name: "Plain (no frame)",
    apply: (s) => ({
      ...s,
      frame: { ...s.frame, enabled: false, exportWithFrame: false },
    }),
  },
];
