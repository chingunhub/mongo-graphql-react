import { Stepper, useStepper, VizFrame, layerColor } from './Stepper';
import { InlineMd } from './InlineMd';
import { CodeBlock } from '../components/CodeBlock';

export interface SequenceSpec {
  title?: string;
  actors: { id: string; label: string; sub?: string; color?: string }[];
  steps: { from: string; to: string; label: string; note?: string; ret?: boolean; payload?: string; lang?: string }[];
}

const W = 760;
const ROW = 44;
const TOP = 78;

export function Sequence({ spec }: { spec: SequenceSpec }) {
  const s = useStepper(spec.steps.length);
  const n = spec.actors.length;
  const margin = 80;
  const xs = Object.fromEntries(
    spec.actors.map((a, i) => [a.id, n === 1 ? W / 2 : margin + (i * (W - 2 * margin)) / (n - 1)]),
  );
  const H = TOP + spec.steps.length * ROW + 16;
  const cur = spec.steps[s.step];
  const boxW = Math.min(150, (W - 40) / n - 12);

  return (
    <VizFrame title={spec.title} s={s}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        <defs>
          {['cur', 'past'].map((k) => (
            <marker
              key={k}
              id={`seq-arrow-${k}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill={k === 'cur' ? 'var(--forge)' : 'var(--text-faint)'} />
            </marker>
          ))}
        </defs>
        {spec.actors.map((a) => {
          const x = xs[a.id];
          const color = layerColor(a.color);
          const active = cur && (cur.from === a.id || cur.to === a.id);
          return (
            <g key={a.id}>
              <line x1={x} x2={x} y1={56} y2={H - 6} stroke="var(--line-strong)" strokeDasharray="3 4" />
              <rect
                x={x - boxW / 2}
                y={8}
                width={boxW}
                height={a.sub ? 46 : 38}
                rx={9}
                fill={`color-mix(in srgb, ${color} ${active ? 22 : 10}%, var(--bg-elev))`}
                stroke={color}
                strokeWidth={active ? 2 : 1}
              />
              <text x={x} y={a.sub ? 28 : 32} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--text)">
                {a.label}
              </text>
              {a.sub && (
                <text x={x} y={45} textAnchor="middle" fontSize="10.5" fill="var(--text-dim)">
                  {a.sub}
                </text>
              )}
            </g>
          );
        })}
        {spec.steps.map((st, i) => {
          const y = TOP + i * ROW + 18;
          const x1 = xs[st.from];
          const x2 = xs[st.to];
          const state = i === s.step ? 'cur' : i < s.step ? 'past' : 'future';
          const stroke = state === 'cur' ? 'var(--forge)' : 'var(--text-faint)';
          const opacity = state === 'future' ? 0.13 : 1;
          if (x1 === x2) {
            return (
              <g key={i} opacity={opacity} style={{ transition: 'opacity .3s' }} onClick={() => s.set(i)}>
                <path
                  d={`M${x1},${y - 8} h36 v16 h-34`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={state === 'cur' ? 2 : 1.3}
                  strokeDasharray={st.ret ? '5 4' : undefined}
                  markerEnd={`url(#seq-arrow-${state === 'cur' ? 'cur' : 'past'})`}
                />
                <text x={x1 + 44} y={y + 4} fontSize="12" fill="var(--text)" className="mono">
                  {st.label}
                </text>
              </g>
            );
          }
          const dir = x2 > x1 ? 1 : -1;
          return (
            <g key={i} opacity={opacity} style={{ transition: 'opacity .3s', cursor: 'pointer' }} onClick={() => s.set(i)}>
              <line
                x1={x1 + dir * 4}
                x2={x2 - dir * 6}
                y1={y}
                y2={y}
                stroke={stroke}
                strokeWidth={state === 'cur' ? 2.2 : 1.3}
                strokeDasharray={st.ret ? '6 4' : undefined}
                markerEnd={`url(#seq-arrow-${state === 'cur' ? 'cur' : 'past'})`}
              />
              <text
                x={(x1 + x2) / 2}
                y={y - 7}
                textAnchor="middle"
                fontSize="12"
                fill={state === 'cur' ? 'var(--text)' : 'var(--text-dim)'}
                fontWeight={state === 'cur' ? 600 : 400}
                className="mono"
              >
                {st.label}
              </text>
            </g>
          );
        })}
      </svg>
      <Stepper s={s} caption={cur?.note ? <InlineMd text={cur.note} /> : null} />
      {cur?.payload && (
        <div style={{ marginTop: 8 }}>
          <CodeBlock code={cur.payload} lang={cur.lang ?? 'json'} showLang={false} />
        </div>
      )}
    </VizFrame>
  );
}
