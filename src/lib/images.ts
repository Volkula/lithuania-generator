// Centralised image cache. Canvas drawing is synchronous, so every image
// source must be decoded before we paint. The cache notifies subscribers
// (the React stage) whenever a new image finishes loading so it can repaint.

type Listener = () => void;

const cache = new Map<string, HTMLImageElement>();
const pending = new Set<string>();
const failed = new Set<string>();
const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function getImage(src: string | null): HTMLImageElement | undefined {
  if (!src) return undefined;
  const hit = cache.get(src);
  if (hit) return hit;
  if (pending.has(src) || failed.has(src)) return undefined;

  pending.add(src);
  const img = new Image();
  // Allow drawing remote images to the canvas without tainting it, as long
  // as the remote host sends permissive CORS headers.
  img.crossOrigin = "anonymous";
  img.onload = () => {
    cache.set(src, img);
    pending.delete(src);
    notify();
  };
  img.onerror = () => {
    pending.delete(src);
    failed.add(src);
    notify();
  };
  img.src = src;
  return undefined;
}

export function hasFailed(src: string | null): boolean {
  return !!src && failed.has(src);
}

export function clearFailure(src: string) {
  failed.delete(src);
}
