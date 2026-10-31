import { useCallback, useState } from 'react';

/** A pane size in px, remembered per viewer (null = the layout's default). */
export function usePaneSize(key: string, { min, max }: { min: number; max: number }) {
  const storageKey = `forge-pane-${key}`;
  const [size, setSizeState] = useState<number | null>(() => {
    try {
      const v = Number(localStorage.getItem(storageKey));
      return v > 0 ? v : null;
    } catch {
      return null;
    }
  });
  const setSize = useCallback(
    (px: number | null) => {
      const next = px === null ? null : Math.round(Math.min(max, Math.max(min, px)));
      setSizeState(next);
      try {
        if (next === null) localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, String(next));
      } catch {
        /* storage unavailable: the size just isn't remembered */
      }
    },
    [min, max, storageKey],
  );
  return [size, setSize] as const;
}

/**
 * A drag handle between two panes. `onDrag` receives the pointer position (clientX for a
 * vertical divider, clientY for a horizontal one); the parent turns it into a size.
 * Double-click resets to the default layout.
 */
export function Splitter({
  axis,
  onDrag,
  onReset,
  label,
  className = '',
}: {
  className?: string;
  axis: 'x' | 'y';
  onDrag: (clientPos: number) => void;
  onReset: () => void;
  label: string;
}) {
  return (
    <div
      className={`splitter splitter-${axis} ${className}`}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      title={`${label} — drag to resize, double-click to reset`}
      onDoubleClick={onReset}
      onPointerDown={(e) => {
        e.preventDefault();
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        // iframes (previews) would swallow pointer events mid-drag; CSS disables them while dragging.
        document.body.classList.add('dragging', `dragging-${axis}`);
        const move = (ev: PointerEvent) => onDrag(axis === 'x' ? ev.clientX : ev.clientY);
        const up = () => {
          document.body.classList.remove('dragging', `dragging-${axis}`);
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          el.removeEventListener('pointercancel', up);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
      }}
    />
  );
}
