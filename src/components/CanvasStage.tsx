import { useEffect, useRef, useState } from "react";
import { EditorState, ImageLayer, Layer } from "../types";
import { getCanvasDimensions } from "../lib/canvasSize";
import { Box, drawScene, layerBox } from "../lib/render";
import { getImage, subscribe } from "../lib/images";

type Handle = "nw" | "ne" | "sw" | "se";

const DISPLAY_BASE = 640; // longest canvas edge at 100% zoom
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5;
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

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
  const stageRef = useRef<HTMLDivElement>(null);
  const renderRef = useRef<() => void>(() => {});
  const guidesRef = useRef<Guide[]>([]);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(false);
  const [gridSize, setGridSize] = useState(64);
  const { width: canvasW, height: canvasH } = getCanvasDimensions(state);
  const displayScale = DISPLAY_BASE / Math.max(canvasW, canvasH);

  const fitZoom = () => {
    const area = stageRef.current?.parentElement;
    if (!area) return;
    const aw = area.clientWidth - 48;
    const ah = area.clientHeight - 96;
    const baseW = canvasW * displayScale;
    const baseH = canvasH * displayScale;
    setZoom(clampZoom(Math.min(aw / baseW, ah / baseH)));
  };
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

    octx.clearRect(0, 0, canvasW, canvasH);
    const sel = state.layers.find((l) => l.id === state.selectedId);

    // Layout grid with measurement ticks (overlay only — never exported).
    if (showGrid) {
      octx.save();
      octx.lineWidth = 1;
      octx.font = "11px system-ui, sans-serif";
      octx.fillStyle = "rgba(148,163,184,0.85)";
      const midX = canvasW / 2;
      const midY = canvasH / 2;
      octx.strokeStyle = "rgba(236,72,153,0.45)";
      octx.beginPath();
      octx.moveTo(midX, 0);
      octx.lineTo(midX, canvasH);
      octx.moveTo(0, midY);
      octx.lineTo(canvasW, midY);
      octx.stroke();
      octx.fillText(String(Math.round(midX)), midX + 4, 14);
      octx.fillText(String(Math.round(midY)), 4, midY - 4);
      for (let x = gridSize; x < canvasW; x += gridSize) {
        octx.strokeStyle =
          x % (gridSize * 4) === 0
            ? "rgba(59,130,246,0.35)"
            : "rgba(59,130,246,0.15)";
        octx.beginPath();
        octx.moveTo(x, 0);
        octx.lineTo(x, canvasH);
        octx.stroke();
        octx.fillText(String(x), x + 2, 12);
      }
      for (let y = gridSize; y < canvasH; y += gridSize) {
        octx.strokeStyle =
          y % (gridSize * 4) === 0
            ? "rgba(59,130,246,0.35)"
            : "rgba(59,130,246,0.15)";
        octx.beginPath();
        octx.moveTo(0, y);
        octx.lineTo(canvasW, y);
        octx.stroke();
        octx.fillText(String(y), 2, y - 3);
      }
      octx.strokeStyle = "rgba(34,211,238,0.55)";
      octx.lineWidth = 1.5;
      for (const f of [1 / 3, 1 / 2, 2 / 3]) {
        const px = Math.round(canvasW * f);
        const py = Math.round(canvasH * f);
        octx.beginPath();
        octx.moveTo(px, 0);
        octx.lineTo(px, canvasH);
        octx.moveTo(0, py);
        octx.lineTo(canvasW, py);
        octx.stroke();
      }
      octx.restore();
    }

    // Alignment guides.
    octx.strokeStyle = "#ff3b6b";
    octx.lineWidth = 1.5;
    for (const g of guidesRef.current) {
      octx.beginPath();
      if (g.axis === "x") {
        octx.moveTo(g.pos, 0);
        octx.lineTo(g.pos, canvasH);
      } else {
        octx.moveTo(0, g.pos);
        octx.lineTo(canvasW, g.pos);
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

  useEffect(() => {
    fitZoom();
  }, [canvasW, canvasH]);

  useEffect(() => {
    const scene = sceneRef.current;
    const overlay = overlayRef.current;
    if (scene) {
      scene.width = canvasW;
      scene.height = canvasH;
    }
    if (overlay) {
      overlay.width = canvasW;
      overlay.height = canvasH;
    }
    renderRef.current();
  }, [canvasW, canvasH]);

  // Ctrl + wheel zoom (native non-passive listener so we can preventDefault).
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => clampZoom(z * (e.deltaY < 0 ? 1.1 : 0.9)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function toCanvasCoords(e: React.PointerEvent): { x: number; y: number } {
    const rect = sceneRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvasW / rect.width),
      y: (e.clientY - rect.top) * (canvasH / rect.height),
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
    const cxTarget = canvasW / 2;
    const cyTarget = canvasH / 2;
    let sx = dx;
    let sy = dy;
    const left = startBox.x + dx;
    const cx = startBox.x + startBox.w / 2 + dx;
    const right = startBox.x + startBox.w + dx;
    const top = startBox.y + dy;
    const cy = startBox.y + startBox.h / 2 + dy;
    const bottom = startBox.y + startBox.h + dy;

    const xs: [number, number][] = [
      [cx, cxTarget],
      [left, 0],
      [right, canvasW],
      [cx, 0],
      [cx, canvasW],
    ];
    for (const [val, target] of xs) {
      if (Math.abs(val - target) <= SNAP) {
        sx += target - val;
        guides.push({ axis: "x", pos: target });
        break;
      }
    }
    const ys: [number, number][] = [
      [cy, cyTarget],
      [top, 0],
      [bottom, canvasH],
      [cy, 0],
      [cy, canvasH],
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

  const displayW = Math.round(canvasW * displayScale * zoom);
  const displayH = Math.round(canvasH * displayScale * zoom);

  return (
    <div className="stage" ref={stageRef}>
      <div className="stage-toolbar">
        <div className="zoom-controls">
          <button
            onClick={() => setZoom((z) => clampZoom(z - 0.25))}
            title="Zoom out"
          >
            −
          </button>
          <span className="zoom-label">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => clampZoom(z + 0.25))}
            title="Zoom in"
          >
            +
          </button>
          <button onClick={() => setZoom(1)} title="Actual size">
            1:1
          </button>
          <button onClick={fitZoom} title="Fit to view">
            Fit
          </button>
        </div>
        <div className="grid-controls">
          <button
            className={showGrid ? "active" : ""}
            onClick={() => setShowGrid((g) => !g)}
            title="Toggle layout grid (not exported)"
          >
            ▦ Grid
          </button>
          {showGrid && (
            <select
              value={gridSize}
              onChange={(e) => setGridSize(Number(e.target.value))}
              title="Grid spacing"
            >
              <option value={32}>32px</option>
              <option value={64}>64px</option>
              <option value={128}>128px</option>
            </select>
          )}
        </div>
      </div>
      <div
        className="stage-canvas-wrap"
        style={{ width: displayW, height: displayH }}
      >
        <canvas
          ref={sceneRef}
          width={canvasW}
          height={canvasH}
          className="scene-canvas"
        />
        <canvas
          ref={overlayRef}
          width={canvasW}
          height={canvasH}
          className="overlay-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      </div>
      <div className="stage-caption">
        {canvasW} × {canvasH} · Ctrl+wheel zoom · grid is overlay only
        {cropMode ? " · CROP MODE" : ""}
      </div>
    </div>
  );
}
