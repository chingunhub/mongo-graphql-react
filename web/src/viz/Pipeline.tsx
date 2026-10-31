import { Stepper, useStepper, VizFrame, layerColor } from './Stepper';
import { InlineMd } from './InlineMd';

export interface PipelineSpec {
  title?: string;
  color?: string;
  input: { label?: string; docs: unknown[]; note?: string };
  stages: { label: string; code?: string; docs: unknown[]; note?: string }[];
}

function compact(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return v.startsWith('$$') ? v.slice(2) : JSON.stringify(v);
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return '[' + v.map(compact).join(', ') + ']';
  return '{ ' + Object.entries(v as object).map(([k, x]) => `${k}: ${compact(x)}`).join(', ') + ' }';
}

export function Pipeline({ spec }: { spec: PipelineSpec }) {
  const s = useStepper(spec.stages.length + 1);
  const color = layerColor(spec.color ?? 'mongo');
  const current = s.step === 0 ? spec.input : spec.stages[s.step - 1];
  const note = s.step === 0 ? spec.input.note : spec.stages[s.step - 1].note;
  return (
    <VizFrame title={spec.title} s={s}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        {[{ label: spec.input.label ?? 'collection', code: undefined }, ...spec.stages].map((st, i) => {
          const active = i === s.step;
          const past = i < s.step;
          return (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <span style={{ color: past || active ? color : 'var(--text-faint)' }}>→</span>}
              <button
                onClick={() => s.set(i)}
                style={{
                  border: `1px solid ${active ? color : 'var(--line)'}`,
                  background: active ? `color-mix(in srgb, ${color} 16%, transparent)` : 'var(--bg)',
                  borderRadius: 8,
                  padding: '5px 10px',
                  fontFamily: 'var(--mono)',
                  fontSize: 12.5,
                  opacity: i > s.step ? 0.5 : 1,
                  textAlign: 'left',
                }}
              >
                <div style={{ fontWeight: 600 }}>{st.label}</div>
                {st.code && <div style={{ color: 'var(--text-dim)', fontSize: 11.5 }}>{st.code}</div>}
              </button>
            </span>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 6 }}>
        {current.docs.length} document{current.docs.length === 1 ? '' : 's'} {s.step === 0 ? 'going in' : 'coming out'}
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {current.docs.map((d, i) => (
          <div
            key={s.step + '-' + i}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 12.5,
              padding: '6px 10px',
              borderRadius: 7,
              border: `1px solid color-mix(in srgb, ${color} 30%, var(--line))`,
              background: `color-mix(in srgb, ${color} 6%, var(--bg))`,
              animation: 'fadein .3s',
              overflowX: 'auto',
              whiteSpace: 'nowrap',
            }}
          >
            {compact(d)}
          </div>
        ))}
      </div>
      <Stepper s={s} caption={note ? <InlineMd text={note} /> : null} />
    </VizFrame>
  );
}
