import { useCallback, useState } from "react";

export type CommitMode = "commit" | "replace";

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

const MAX_HISTORY = 100;

export function useHistory<T>(initial: T) {
  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initial,
    future: [],
  });

  const set = useCallback(
    (updater: T | ((prev: T) => T), mode: CommitMode = "commit") => {
      setHistory((h) => {
        const next =
          typeof updater === "function"
            ? (updater as (prev: T) => T)(h.present)
            : updater;
        if (next === h.present) return h;
        if (mode === "replace") {
          return { ...h, present: next };
        }
        const past = [...h.past, h.present].slice(-MAX_HISTORY);
        return { past, present: next, future: [] };
      });
    },
    []
  );

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const previous = h.past[h.past.length - 1];
      return {
        past: h.past.slice(0, -1),
        present: previous,
        future: [h.present, ...h.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const next = h.future[0];
      return {
        past: [...h.past, h.present],
        present: next,
        future: h.future.slice(1),
      };
    });
  }, []);

  const reset = useCallback((value: T) => {
    setHistory({ past: [], present: value, future: [] });
  }, []);

  return {
    state: history.present,
    set,
    undo,
    redo,
    reset,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
