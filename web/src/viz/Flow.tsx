import { Stepper, useStepper, VizFrame, layerColor } from './Stepper';
import { InlineMd } from './InlineMd';

export interface FlowSpec {
  title?: string;
  colWidth?: number;
  rowHeight?: number;
  nodes: { id: string; label: string; sub?: string; col: number; row: number; color?: string; w?: number }[];
  edges: { from: string; to: string; label?: string; dashed?: boolean; color?: string }[];
  /** focus: node ids and edge keys like "a>b" */
  steps?: { focus: string[]; caption: string }[];
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clip(from: Box, to: Box) {
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  const tx = to.x + to.w / 2;
  const ty = to.y + to.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  const sx = dx === 0 ? Infinity : from.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : from.h / 2 / Math.abs(dy);
  const t = Math.min(sx, sy);
  return { x: cx + dx * t, y: cy + dy * t };
}

export function Flow({ spec }: { spec: FlowSpec }) {
  const steps = spec.steps ?? [];
  const s = useStepper(Math.max(1, steps.length));
  const colW = spec.colWidth ?? 190;
  const rowH = spec.rowHeight ?? 92;
  const boxes: Record<string, Box> = {};
  let W = 0;
  let H = 0;
  for (const n of spec.nodes) {
    const w = n.w ?? 156;
    const h = n.sub ? 56 : 44;
    const x = n.col * colW + (colW - w) / 2;
    const y = n.row * rowH + (rowH - h) / 2;
    boxes[n.id] = { x, y, w, h };
    W = Math.max(W, x + w + (colW - w) / 2);
    H = Math.max(H, y + h + (rowH - h) / 2);
  }
  const focus = steps.length ? new Set(steps[s.step]?.focus ?? []) : null;
  const dim = (key: string) => (focus && !focus.has(key) ? 0.22 : 1);

  return (
    <VizFrame title={spec.title} s={steps.length ? s : undefined}>
      <svg viewBox={`-4 -4 ${W + 8} ${H + 8}`} style={{ maxHeight: 520 }}>
        <defs>
          <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
          </marker>
        </defs>
        {spec.edges.map((e, i) => {
          const a = boxes[e.from];
          const b = boxes[e.to];
          if (!a || !b) return null;
          const p1 = clip(a, b);
          const p2 = clip(b, a);
          const key = `${e.from}>${e.to}`;
          const hot = focus?.has(key);
          const stroke = hot ? 'var(--forge)' : layerColor(e.color ?? 'neutral');
          const mx = (p1.x + p2.x) / 2;
          const my = (p1.y + p2.y) / 2;
          return (
            <g key={i} opacity={dim(key)} style={{ transition: 'opacity .3s' }}>
              <line
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={stroke}
                strokeWidth={hot ? 2.4 : 1.5}
                strokeDasharray={e.dashed ? '6 4' : undefined}
                markerEnd="url(#flow-arrow)"
              />
              {e.label && (
                <g>
                  <rect
                    x={mx - e.label.length * 3.4 - 6}
                    y={my - 10}
                    width={e.label.length * 6.8 + 12}
                    height={19}
                    rx={5}
                    fill="var(--bg-elev)"
                    stroke="var(--line)"
                  />
                  <text x={mx} y={my + 4} textAnchor="middle" fontSize="11" fill="var(--text-dim)" className="mono">
                    {e.label}
                  </text>
                </g>
              )}
            </g>
          );
        })}
        {spec.nodes.map((n) => {
          const b = boxes[n.id];
          const color = layerColor(n.color);
          const hot = focus?.has(n.id);
          return (
            <g key={n.id} opacity={dim(n.id)} style={{ transition: 'opacity .3s' }}>
              <rect
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx={10}
                fill={`color-mix(in srgb, ${color} ${hot ? 22 : 11}%, var(--bg-elev))`}
                stroke={hot ? 'var(--forge)' : color}
                strokeWidth={hot ? 2.2 : 1.2}
              />
              <text
                x={b.x + b.w / 2}
                y={b.y + (n.sub ? 23 : b.h / 2 + 4.5)}
                textAnchor="middle"
                fontSize="13"
                fontWeight="600"
                fill="var(--text)"
              >
                {n.label}
              </text>
              {n.sub && (
                <text x={b.x + b.w / 2} y={b.y + 41} textAnchor="middle" fontSize="11" fill="var(--text-dim)" className="mono">
                  {n.sub}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {steps.length > 0 && <Stepper s={s} caption={<InlineMd text={steps[s.step].caption} />} />}
    </VizFrame>
  );
}
