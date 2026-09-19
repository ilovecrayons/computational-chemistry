"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";

type SwipeHandlers = {
  onLeft?: () => void;
  onRight?: () => void;
  onUp?: () => void;
  disabled?: boolean;
};

export function useSwipe({
  onLeft,
  onRight,
  onUp,
  disabled = false,
}: SwipeHandlers) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const active = useRef(false);

  function onPointerDown(event: ReactPointerEvent) {
    if (disabled) return;
    active.current = true;
    start.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerUp(event: ReactPointerEvent) {
    if (!active.current || !start.current || disabled) return;
    active.current = false;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;
    start.current = null;
    if (Math.abs(dx) < 48 && Math.abs(dy) < 48) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx < -48) onLeft?.();
      else if (dx > 48) onRight?.();
      return;
    }
    if (dy < -48) onUp?.();
  }

  function onPointerCancel() {
    active.current = false;
    start.current = null;
  }

  return { onPointerDown, onPointerUp, onPointerCancel };
}
