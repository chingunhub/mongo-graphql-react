import { useMemo, useState } from 'react';
import { VizFrame } from './Stepper';

const hex = (n: number, len: number) => n.toString(16).padStart(len, '0');

/** Interactive anatomy of a MongoDB ObjectId: 4-byte timestamp · 5-byte process random · 3-byte counter. */
export function ObjectIdViz() {
  const random = useMemo(
    () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => hex(b, 2)).join(''),
    [],
  );
  const [counter, setCounter] = useState(() => Math.floor(Math.random() * 0xffffff));
  const [ts, setTs] = useState(() => Math.floor(Date.now() / 1000));
  const parts = [
    { label: 'timestamp', hexv: hex(ts, 8), color: 'var(--forge)', note: `${new Date(ts * 1000).toLocaleString()} (seconds since 1970)` },
    { label: 'random', hexv: random, color: 'var(--gql)', note: 'unique per machine/process — same for every id this process makes' },
    { label: 'counter', hexv: hex(counter % 0xffffff, 6), color: 'var(--react)', note: 'increments for each new id' },
  ];
  return (
    <VizFrame title="Anatomy of an ObjectId (12 bytes = 24 hex characters)">
      <div style={{ fontFamily: 'var(--mono)', fontSize: 22, letterSpacing: '0.04em', display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 14 }}>
        <span style={{ color: 'var(--text-faint)' }}>ObjectId("</span>
        {parts.map((p) => (
          <span key={p.label} style={{ color: p.color, borderBottom: `3px solid ${p.color}`, paddingBottom: 2 }}>
            {p.hexv}
          </span>
        ))}
        <span style={{ color: 'var(--text-faint)' }}>")</span>
      </div>
      <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
        {parts.map((p) => (
          <div key={p.label} style={{ display: 'flex', gap: 10 }}>
            <span style={{ width: 90, fontWeight: 650, color: p.color }}>{p.label}</span>
            <span style={{ color: 'var(--text-dim)' }}>{p.note}</span>
          </div>
        ))}
      </div>
      <div className="stepper">
        <button
          className="btn small"
          onClick={() => {
            setTs(Math.floor(Date.now() / 1000));
            setCounter((c) => c + 1);
          }}
        >
          Generate the next id
        </button>
        <span className="caption" style={{ color: 'var(--text-dim)' }}>
          Watch which part changes. Ids made later sort later — roughly. Ids made in the same second differ only in the counter.
        </span>
      </div>
    </VizFrame>
  );
}
