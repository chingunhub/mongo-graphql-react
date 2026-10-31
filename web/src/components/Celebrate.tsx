import { useEffect, useMemo } from 'react';

const COLORS = ['#13aa52', '#e535ab', '#0ea5e9', '#f97316', '#facc15'];

/** A short burst of sparks when a task passes for the first time. */
export function Celebrate({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1900);
    return () => clearTimeout(t);
  }, [onDone]);
  const sparks = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: 50 + (Math.random() - 0.5) * 24,
        dx: (Math.random() - 0.5) * 700,
        dy: -(220 + Math.random() * 380),
        size: 6 + Math.random() * 7,
        c: COLORS[i % COLORS.length],
        d: Math.random() * 0.15,
      })),
    [],
  );
  return (
    <div className="celebrate">
      <style>{`@keyframes spark {
        0% { transform: translate(0,0) scale(1); opacity: 1 }
        60% { opacity: 1 }
        100% { transform: translate(var(--dx), calc(var(--dy) + 260px)) scale(.6); opacity: 0 }
      }`}</style>
      {sparks.map((s, i) => (
        <span
          key={i}
          style={
            {
              position: 'absolute',
              left: `${s.left}%`,
              bottom: '12%',
              width: s.size,
              height: s.size,
              borderRadius: i % 3 ? '50%' : 2,
              background: s.c,
              '--dx': `${s.dx}px`,
              '--dy': `${s.dy}px`,
              animation: `spark 1.6s ${s.d}s cubic-bezier(.15,.75,.35,1) forwards`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
