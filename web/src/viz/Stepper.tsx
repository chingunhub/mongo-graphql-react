import { useEffect, useRef, useState, type ReactNode } from 'react';

export function useStepper(count: number, initial = 0) {
  const [step, setStep] = useState(initial);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    if (step >= count - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => s + 1), 1800);
    return () => clearTimeout(t);
  }, [playing, step, count]);
  return {
    step,
    count,
    playing,
    set: (n: number) => setStep(Math.max(0, Math.min(count - 1, n))),
    next: () => setStep((s) => Math.min(count - 1, s + 1)),
    prev: () => setStep((s) => Math.max(0, s - 1)),
    toggle: () => {
      if (step >= count - 1) setStep(0);
      setPlaying((p) => !p);
    },
  };
}

export type StepperState = ReturnType<typeof useStepper>;

export function Stepper({ s, caption }: { s: StepperState; caption: ReactNode }) {
  return (
    <div className="stepper">
      <button className="icon-btn" onClick={s.prev} disabled={s.step === 0} title="Previous step (←)">
        ‹
      </button>
      <button className="icon-btn" onClick={s.toggle} title="Play">
        {s.playing ? '❚❚' : '▶'}
      </button>
      <button className="icon-btn" onClick={s.next} disabled={s.step >= s.count - 1} title="Next step (→)">
        ›
      </button>
      <div className="caption">{caption}</div>
      <span className="count">
        {s.step + 1}/{s.count}
      </span>
    </div>
  );
}

/** Wrapper that gives a viz a title and arrow-key stepping when focused. */
export function VizFrame({
  title,
  s,
  children,
}: {
  title?: string;
  s?: StepperState;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      className="viz"
      ref={ref}
      tabIndex={s ? 0 : undefined}
      onKeyDown={(e) => {
        if (!s) return;
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          s.next();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          s.prev();
        }
      }}
    >
      {title && <div className="viz-title">{title}</div>}
      {children}
    </div>
  );
}

export const LAYER: Record<string, string> = {
  react: 'var(--react)',
  client: 'var(--react)',
  gql: 'var(--gql)',
  graphql: 'var(--gql)',
  server: 'var(--gql)',
  mongo: 'var(--mongo)',
  db: 'var(--mongo)',
  mongoose: 'var(--mongo)',
  forge: 'var(--forge)',
  neutral: 'var(--text-faint)',
  bad: 'var(--bad)',
  ok: 'var(--ok)',
};
export const layerColor = (c?: string) => (c ? (LAYER[c] ?? c) : 'var(--text-faint)');
