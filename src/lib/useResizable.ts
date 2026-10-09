import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface UseResizableOptions {
  key: string;
  initial: number;
  min: number;
  max: number;
  axis: 'x' | 'y';
  reverse?: boolean; // e.g. for panels anchored at bottom where dragging up increases height
}

export interface UseResizableReturn {
  size: number;
  setSize: (size: number | ((prev: number) => number)) => void;
  reset: () => void;
  dragHandleProps: {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
    onDoubleClick: () => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
    tabIndex: number;
    role: string;
    'aria-orientation': 'vertical' | 'horizontal';
    'aria-valuenow': number;
    'aria-valuemin': number;
    'aria-valuemax': number;
  };
}

export function useResizable({
  key,
  initial,
  min,
  max,
  axis,
  reverse = false,
}: UseResizableOptions): UseResizableReturn {
  const storageKey = `obsidian.layout.${key}`;

  const [size, setSizeState] = useState<number>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        const parsed = Number(stored);
        if (!isNaN(parsed) && parsed >= min && parsed <= max) {
          return parsed;
        }
      }
    } catch {}
    return initial;
  });

  const isDraggingRef = useRef(false);
  const startPosRef = useRef(0);
  const startSizeRef = useRef(size);
  const rAFRef = useRef<number | null>(null);

  const setSize = useCallback(
    (newSizeOrFn: number | ((prev: number) => number)) => {
      setSizeState((prev) => {
        const next = typeof newSizeOrFn === 'function' ? newSizeOrFn(prev) : newSizeOrFn;
        const clamped = Math.max(min, Math.min(max, next));
        try {
          localStorage.setItem(storageKey, String(clamped));
        } catch {}
        return clamped;
      });
    },
    [min, max, storageKey]
  );

  const reset = useCallback(() => {
    setSize(initial);
  }, [initial, setSize]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      isDraggingRef.current = true;
      startPosRef.current = axis === 'x' ? e.clientX : e.clientY;
      startSizeRef.current = size;
      document.body.style.userSelect = 'none';
    },
    [axis, size]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!isDraggingRef.current) return;

      const currentPos = axis === 'x' ? e.clientX : e.clientY;
      const delta = currentPos - startPosRef.current;
      const effectiveDelta = reverse ? -delta : delta;
      const rawNewSize = startSizeRef.current + effectiveDelta;
      const clamped = Math.max(min, Math.min(max, rawNewSize));

      if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
      rAFRef.current = requestAnimationFrame(() => {
        setSizeState(clamped);
      });
    },
    [axis, min, max, reverse]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      document.body.style.userSelect = '';
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}

      if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
      // Persist final size
      try {
        localStorage.setItem(storageKey, String(size));
      } catch {}
    },
    [size, storageKey]
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      onPointerUp(e);
    },
    [onPointerUp]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      let delta = 0;
      if (axis === 'x') {
        if (e.key === 'ArrowRight') delta = 16;
        else if (e.key === 'ArrowLeft') delta = -16;
      } else {
        if (e.key === 'ArrowUp') delta = reverse ? 16 : -16;
        else if (e.key === 'ArrowDown') delta = reverse ? -16 : 16;
      }

      if (e.key === 'Home') {
        e.preventDefault();
        reset();
      } else if (delta !== 0) {
        e.preventDefault();
        setSize((prev) => prev + delta);
      }
    },
    [axis, reset, reverse, setSize]
  );

  // Sync size to localStorage whenever size finishes changing
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(size));
    } catch {}
  }, [size, storageKey]);

  return {
    size,
    setSize,
    reset,
    dragHandleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onDoubleClick: reset,
      onKeyDown,
      tabIndex: 0,
      role: 'separator',
      'aria-orientation': axis === 'x' ? 'vertical' : 'horizontal',
      'aria-valuenow': size,
      'aria-valuemin': min,
      'aria-valuemax': max,
    },
  };
}
