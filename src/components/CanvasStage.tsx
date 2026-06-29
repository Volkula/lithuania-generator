import { useEffect, useRef } from "react";
import { CANVAS_SIZE, EditorState, Layer } from "../types";
import { Box, drawScene, layerBox } from "../lib/render";
import { subscribe } from "../lib/images";

type Handle = "nw" | "ne" | "sw" | "se";

interface Props {
  state: EditorState;
  setState: (
    updater: EditorState | ((prev: EditorState) => EditorState),
    mode?: "commit" | "replace"
  ) => void;
  onSelect: (id: string | null) => void;
}

const HANDLE = 16;

function handlePositions(box: Box): Record<Handle, { x: number; y: number }> {
  return {
    nw: { x: box.x, y: box.y },
    ne: { x: box.x + box.w, y: box.y },
    sw: { x: box.x, y: box.y + box.h },
    se: { x: box.x + box.w, y: box.y + box.h },
  };
}

export default function CanvasStage({ state, setState, onSelect }: Props) {
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const renderRef = useRef<() => void>(() => {});
  const interaction = useRef<{
    mode: "move" | "resize";
    handle?: Handle;
    startX: number;
    startY: number;
    startLayer: Layer;
    committed: boolean;
  } | null>(null);

  // Recreate the paint closure every render so it always sees current state.
  renderRef.current = () => {
    const scene = sceneRef.current;
    const overlay = overlayRef.current;
    if (!scene || !overlay) return;
    const sctx = scene.getContext("2d", { willReadFrequently: true });
    const octx = overlay.getContext("2d");
    if (!sctx || !octx) return;
    drawScene(sctx, state, { includeFrame: state.frame.enabled });

    octx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const sel = state.layers.find((l) => l.id === state.selectedId);
    if (sel && sel.visible) {
      const box = layerBox(sctx, sel);
      octx.strokeStyle = "#3b82f6";
      octx.lineWidth = 2;
      octx.setLineDash([8, 6]);
      octx.strokeRect(box.x, box.y, box.w, box.h);
      octx.setLineDash([]);
      octx.fillStyle = "#3b82f6";
      const hp = handlePositions(box);
      for (const k of Object.keys(hp) as Handle[]) {
        const p = hp[k];
        octx.fillRect(p.x - HANDLE / 2, p.y - HANDLE / 2, HANDLE, HANDLE);
      }
    }
  };

  useEffect(() => {
    renderRef.current();
  });

  useEffect(() => subscribe(() => renderRef.current()), []);

  function toCanvasCoords(e: React.PointerEvent): { x: number; y: number } {
    const rect = sceneRef.current!.getBoundingClientRect();
    const scale = CANVAS_SIZE / rect.width;
    return {
      x: (e.clientX - rect.left) * scale,
      y: (e.clientY - rect.top) * scale,
    };
  }

  function hitHandle(box: Box, p: { x: number; y: number }): Handle | null {
    const hp = handlePositions(box);
    for (const k of Object.keys(hp) as Handle[]) {
      const h = hp[k];
      if (Math.abs(p.x - h.x) <= HANDLE && Math.abs(p.y - h.y) <= HANDLE)
        return k;
    }
    return null;
  }

  function hitLayer(p: { x: number; y: number }): Layer | null {
    const sctx = sceneRef.current!.getContext("2d")!;
    for (let i = state.layers.length - 1; i >= 0; i--) {
      const layer = state.layers[i];
      if (!layer.visible) continue;
      const box = layerBox(sctx, layer);
      if (
        p.x >= box.x &&
        p.x <= box.x + box.w &&
        p.y >= box.y &&
        p.y <= box.y + box.h
      ) {
        return layer;
      }
    }
    return null;
  }

  function onPointerDown(e: React.PointerEvent) {
    const p = toCanvasCoords(e);
    const sctx = sceneRef.current!.getContext("2d")!;
    const sel = state.layers.find((l) => l.id === state.selectedId);
    if (sel && sel.visible) {
      const box = layerBox(sctx, sel);
      const handle = hitHandle(box, p);
      if (handle) {
        interaction.current = {
          mode: "resize",
          handle,
          startX: p.x,
          startY: p.y,
          startLayer: { ...sel } as Layer,
          committed: false,
        };
        (e.target as Element).setPointerCapture(e.pointerId);
        return;
      }
    }
    const hit = hitLayer(p);
    onSelect(hit ? hit.id : null);
    if (hit) {
      interaction.current = {
        mode: "move",
        startX: p.x,
        startY: p.y,
        startLayer: { ...hit } as Layer,
        committed: false,
      };
      (e.target as Element).setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const it = interaction.current;
    if (!it) return;
    const p = toCanvasCoords(e);
    const dx = p.x - it.startX;
    const dy = p.y - it.startY;
    const mode = it.committed ? "replace" : "commit";
    it.committed = true;

    setState((prev) => {
      const layers = prev.layers.map((l) => {
        if (l.id !== it.startLayer.id) return l;
        if (it.mode === "move") {
          return { ...l, x: it.startLayer.x + dx, y: it.startLayer.y + dy };
        }
        const base = it.startLayer;
        const minSize = 12;

        if (l.type === "image" && base.type === "image") {
          const right = base.x + base.width;
          const bottom = base.y + base.height;
          let nx = base.x;
          let ny = base.y;
          let nw = base.width;
          let nh = base.height;
          if (it.handle === "se") {
            nw = Math.max(minSize, base.width + dx);
            nh = Math.max(minSize, base.height + dy);
          } else if (it.handle === "ne") {
            nw = Math.max(minSize, base.width + dx);
            nh = Math.max(minSize, base.height - dy);
            ny = bottom - nh;
          } else if (it.handle === "sw") {
            nw = Math.max(minSize, base.width - dx);
            nh = Math.max(minSize, base.height + dy);
            nx = right - nw;
          } else if (it.handle === "nw") {
            nw = Math.max(minSize, base.width - dx);
            nh = Math.max(minSize, base.height - dy);
            nx = right - nw;
            ny = bottom - nh;
          }
          return { ...l, x: nx, y: ny, width: nw, height: nh };
        }

        if (l.type === "text" && base.type === "text") {
          const ratio = Math.max(0.2, 1 + dy / Math.max(base.fontSize, 20));
          const widthRatio = Math.max(0.2, 1 + dx / Math.max(base.maxWidth, 50));
          return {
            ...l,
            fontSize: Math.max(8, Math.round(base.fontSize * ratio)),
            maxWidth: Math.max(40, Math.round(base.maxWidth * widthRatio)),
          };
        }
        return l;
      });
      return { ...prev, layers };
    }, mode);
  }

  function onPointerUp(e: React.PointerEvent) {
    interaction.current = null;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="stage">
      <div className="stage-canvas-wrap">
        <canvas
          ref={sceneRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="scene-canvas"
        />
        <canvas
          ref={overlayRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="overlay-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      </div>
      <div className="stage-caption">1024 × 1024 · strict black &amp; white</div>
    </div>
  );
}
