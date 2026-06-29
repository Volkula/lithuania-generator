import { useEffect, useRef } from "react";
import { CANVAS_SIZE, EditorState, ImageLayer, Layer } from "../types";
import { Box, drawScene, layerBox } from "../lib/render";
import { getImage, subscribe } from "../lib/images";

type Handle = "nw" | "ne" | "sw" | "se";

interface Props {
  state: EditorState;
  setState: (
    updater: EditorState | ((prev: EditorState) => EditorState),
    mode?: "commit" | "replace"
  ) => void;
  onSelect: (id: string | null) => void;
  cropMode: boolean;
}

const HANDLE = 16;
const SNAP = 10;

interface Guide {
  axis: "x" | "y";
  pos: number;
}

function handlePositions(box: Box): Record<Handle, { x: number; y: number }> {
  return {
    nw: { x: box.x, y: box.y },
    ne: { x: box.x + box.w, y: box.y },
    sw: { x: box.x, y: box.y + box.h },
    se: { x: box.x + box.w, y: box.y + box.h },
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

// Full-image ghost box for crop mode: keeps on-screen pixel density constant.
function fullImageBox(base: ImageLayer): Box {
  const scaleX = base.width / Math.max(1, base.cropW);
  const scaleY = base.height / Math.max(1, base.cropH);
  return {
    x: base.x - base.cropX * scaleX,
    y: base.y - base.cropY * scaleY,
    w: base.naturalWidth * scaleX,
    h: base.naturalHeight * scaleY,
  };
}

export default function CanvasStage({
  state,
  setState,
  onSelect,
  cropMode,
}: Props) {
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const renderRef = useRef<() => void>(() => {});
  const guidesRef = useRef<Guide[]>([]);
  const interaction = useRef<{
    kind: "move" | "resize" | "crop-move" | "crop-resize";
    handle?: Handle;
    startX: number;
    startY: number;
    startLayer: Layer;
    committed: boolean;
  } | null>(null);

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

    // Alignment guides.
    octx.strokeStyle = "#ff3b6b";
    octx.lineWidth = 1.5;
    for (const g of guidesRef.current) {
      octx.beginPath();
      if (g.axis === "x") {
        octx.moveTo(g.pos, 0);
        octx.lineTo(g.pos, CANVAS_SIZE);
      } else {
        octx.moveTo(0, g.pos);
        octx.lineTo(CANVAS_SIZE, g.pos);
      }
      octx.stroke();
    }

    if (!sel || !sel.visible) return;

    if (cropMode && sel.type === "image") {
      const img = getImage(sel.src);
      const fb = fullImageBox(sel);
      const cropRect: Box = { x: sel.x, y: sel.y, w: sel.width, h: sel.height };
      // dim full image
      octx.save();
      octx.globalAlpha = 0.3;
      if (img) octx.drawImage(img, fb.x, fb.y, fb.w, fb.h);
      octx.restore();
      // bright crop region
      if (img) {
        octx.drawImage(
          img,
          sel.cropX,
          sel.cropY,
          sel.cropW,
          sel.cropH,
          cropRect.x,
          cropRect.y,
          cropRect.w,
          cropRect.h
        );
      }
      octx.strokeStyle = "#22d3ee";
      octx.lineWidth = 2;
      octx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
      octx.fillStyle = "#22d3ee";
      const hp = handlePositions(cropRect);
      for (const k of Object.keys(hp) as Handle[]) {
        const p = hp[k];
        octx.fillRect(p.x - HANDLE / 2, p.y - HANDLE / 2, HANDLE, HANDLE);
      }
      return;
    }

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

  function snapMove(startBox: Box, dx: number, dy: number) {
    const guides: Guide[] = [];
    const c = CANVAS_SIZE / 2;
    let sx = dx;
    let sy = dy;
    const left = startBox.x + dx;
    const cx = startBox.x + startBox.w / 2 + dx;
    const right = startBox.x + startBox.w + dx;
    const top = startBox.y + dy;
    const cy = startBox.y + startBox.h / 2 + dy;
    const bottom = startBox.y + startBox.h + dy;

    const xs: [number, number][] = [
      [cx, c],
      [left, 0],
      [right, CANVAS_SIZE],
      [cx, 0],
      [cx, CANVAS_SIZE],
    ];
    for (const [val, target] of xs) {
      if (Math.abs(val - target) <= SNAP) {
        sx += target - val;
        guides.push({ axis: "x", pos: target });
        break;
      }
    }
    const ys: [number, number][] = [
      [cy, c],
      [top, 0],
      [bottom, CANVAS_SIZE],
      [cy, 0],
      [cy, CANVAS_SIZE],
    ];
    for (const [val, target] of ys) {
      if (Math.abs(val - target) <= SNAP) {
        sy += target - val;
        guides.push({ axis: "y", pos: target });
        break;
      }
    }
    return { dx: sx, dy: sy, guides };
  }

  function applyCrop(base: ImageLayer, rect: Box): Partial<ImageLayer> {
    const fb = fullImageBox(base);
    const scaleX = base.width / Math.max(1, base.cropW);
    const scaleY = base.height / Math.max(1, base.cropH);
    // clamp the rectangle to the full image bounds
    const x = Math.max(fb.x, Math.min(rect.x, fb.x + fb.w - 12));
    const y = Math.max(fb.y, Math.min(rect.y, fb.y + fb.h - 12));
    const w = Math.max(12, Math.min(rect.w, fb.x + fb.w - x));
    const h = Math.max(12, Math.min(rect.h, fb.y + fb.h - y));
    const cropX = Math.round((x - fb.x) / scaleX);
    const cropY = Math.round((y - fb.y) / scaleY);
    const cropW = Math.round(w / scaleX);
    const cropH = Math.round(h / scaleY);
    return { x, y, width: w, height: h, cropX, cropY, cropW, cropH };
  }

  function onPointerDown(e: React.PointerEvent) {
    const p = toCanvasCoords(e);
    const sctx = sceneRef.current!.getContext("2d")!;
    const sel = state.layers.find((l) => l.id === state.selectedId);

    if (cropMode && sel && sel.type === "image") {
      const cropRect: Box = { x: sel.x, y: sel.y, w: sel.width, h: sel.height };
      const handle = hitHandle(cropRect, p);
      const inside =
        p.x >= cropRect.x &&
        p.x <= cropRect.x + cropRect.w &&
        p.y >= cropRect.y &&
        p.y <= cropRect.y + cropRect.h;
      if (handle || inside) {
        interaction.current = {
          kind: handle ? "crop-resize" : "crop-move",
          handle: handle ?? undefined,
          startX: p.x,
          startY: p.y,
          startLayer: { ...sel },
          committed: false,
        };
        (e.target as Element).setPointerCapture(e.pointerId);
      }
      return;
    }

    if (sel && sel.visible) {
      const box = layerBox(sctx, sel);
      const handle = hitHandle(box, p);
      if (handle) {
        interaction.current = {
          kind: "resize",
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
        kind: "move",
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
    const base = it.startLayer;

    if (it.kind === "crop-move" || it.kind === "crop-resize") {
      if (base.type !== "image") return;
      const start: Box = {
        x: base.x,
        y: base.y,
        w: base.width,
        h: base.height,
      };
      let rect: Box;
      if (it.kind === "crop-move") {
        rect = { x: start.x + dx, y: start.y + dy, w: start.w, h: start.h };
      } else {
        const right = start.x + start.w;
        const bottom = start.y + start.h;
        let nx = start.x;
        let ny = start.y;
        let nw = start.w;
        let nh = start.h;
        if (it.handle === "se") {
          nw = Math.max(12, start.w + dx);
          nh = Math.max(12, start.h + dy);
        } else if (it.handle === "ne") {
          nw = Math.max(12, start.w + dx);
          nh = Math.max(12, start.h - dy);
          ny = bottom - nh;
        } else if (it.handle === "sw") {
          nw = Math.max(12, start.w - dx);
          nh = Math.max(12, start.h + dy);
          nx = right - nw;
        } else {
          nw = Math.max(12, start.w - dx);
          nh = Math.max(12, start.h - dy);
          nx = right - nw;
          ny = bottom - nh;
        }
        rect = { x: nx, y: ny, w: nw, h: nh };
      }
      const patch = applyCrop(base, rect);
      setState(
        (prev) => ({
          ...prev,
          layers: prev.layers.map((l) =>
            l.id === base.id && l.type === "image" ? { ...l, ...patch } : l
          ),
        }),
        mode
      );
      return;
    }

    if (it.kind === "move") {
      const sctx = sceneRef.current!.getContext("2d")!;
      const startBox = layerBox(sctx, base);
      const snapped = snapMove(startBox, dx, dy);
      guidesRef.current = snapped.guides;
      setState(
        (prev) => ({
          ...prev,
          layers: prev.layers.map((l) =>
            l.id === base.id
              ? { ...l, x: base.x + snapped.dx, y: base.y + snapped.dy }
              : l
          ),
        }),
        mode
      );
      return;
    }

    // resize
    setState(
      (prev) => ({
        ...prev,
        layers: prev.layers.map((l) => {
          if (l.id !== base.id) return l;
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
            } else {
              nw = Math.max(minSize, base.width - dx);
              nh = Math.max(minSize, base.height - dy);
              nx = right - nw;
              ny = bottom - nh;
            }
            return { ...l, x: nx, y: ny, width: nw, height: nh };
          }
          if (l.type === "text" && base.type === "text") {
            const ratio = Math.max(0.2, 1 + dy / Math.max(base.fontSize, 20));
            const widthRatio = Math.max(
              0.2,
              1 + dx / Math.max(base.maxWidth, 50)
            );
            return {
              ...l,
              fontSize: Math.max(8, Math.round(base.fontSize * ratio)),
              maxWidth: Math.max(40, Math.round(base.maxWidth * widthRatio)),
            };
          }
          return l;
        }),
      }),
      mode
    );
  }

  function onPointerUp(e: React.PointerEvent) {
    interaction.current = null;
    guidesRef.current = [];
    renderRef.current();
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
      <div className="stage-caption">
        1024 × 1024 · strict black &amp; white
        {cropMode ? " · CROP MODE" : ""}
      </div>
    </div>
  );
}
