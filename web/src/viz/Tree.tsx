import { Stepper, useStepper, VizFrame, layerColor } from './Stepper';
import { InlineMd } from './InlineMd';

export interface TreeNode {
  id?: string;
  label: string;
  value?: string;
  color?: string;
  children?: TreeNode[];
}
export interface TreeSpec {
  title?: string;
  root: TreeNode;
  /** reveal: values that appear at this step (and stay). A value starting with "!" renders as an error. */
  steps?: { focus?: string[]; caption: string; reveal?: Record<string, string> }[];
}

interface Row {
  node: TreeNode;
  id: string;
  depth: number;
  parent: number;
}

const ROW = 34;
const INDENT = 34;
const CHAR = 7.6;

export function Tree({ spec }: { spec: TreeSpec }) {
  const steps = spec.steps ?? [];
  const s = useStepper(Math.max(1, steps.length));
  const rows: Row[] = [];
  const walk = (n: TreeNode, depth: number, parent: number, path: string) => {
    const id = n.id ?? path;
    rows.push({ node: n, id, depth, parent });
    const me = rows.length - 1;
    n.children?.forEach((c, i) => walk(c, depth + 1, me, `${path}.${i}`));
  };
  walk(spec.root, 0, -1, 'r');

  const revealed: Record<string, string> = {};
  steps.slice(0, s.step + 1).forEach((st) => Object.assign(revealed, st.reveal ?? {}));
  const focus = new Set(steps[s.step]?.focus ?? []);

  const W = Math.max(
    ...rows.map((r) => {
      const v = revealed[r.id] ?? r.node.value ?? '';
      return r.depth * INDENT + r.node.label.length * CHAR + 30 + (v ? v.length * CHAR + 50 : 0);
    }),
    300,
  );
  const H = rows.length * ROW + 6;

  return (
    <VizFrame title={spec.title} s={steps.length ? s : undefined}>
      <svg viewBox={`0 0 ${W + 10} ${H}`} style={{ maxWidth: Math.max(420, W + 10), maxHeight: 560 }}>
        {rows.map((r, i) => {
          if (r.parent < 0) return null;
          const p = rows[r.parent];
          const px = p.depth * INDENT + 12;
          const py = r.parent * ROW + ROW / 2 + 11;
          const y = i * ROW + ROW / 2;
          const x = r.depth * INDENT;
          return (
            <path
              key={'l' + i}
              d={`M${px},${py} V${y} H${x}`}
              fill="none"
              stroke="var(--line-strong)"
              strokeWidth={1.2}
            />
          );
        })}
        {rows.map((r, i) => {
          const x = r.depth * INDENT;
          const y = i * ROW + 6;
          const w = r.node.label.length * CHAR + 20;
          const color = layerColor(r.node.color ?? 'gql');
          const hot = focus.has(r.id);
          const value = revealed[r.id] ?? r.node.value;
          const isErr = value?.startsWith('!');
          const v = isErr ? value!.slice(1) : value;
          return (
            <g key={r.id}>
              <rect
                x={x}
                y={y}
                width={w}
                height={ROW - 10}
                rx={6}
                fill={`color-mix(in srgb, ${color} ${hot ? 24 : 9}%, var(--bg-elev))`}
                stroke={hot ? 'var(--forge)' : color}
                strokeWidth={hot ? 2 : 1}
                style={{ transition: 'all .25s' }}
              />
              <text x={x + 10} y={y + 16.5} fontSize="12.5" className="mono" fill="var(--text)">
                {r.node.label}
              </text>
              {v !== undefined && (
                <g style={{ transition: 'opacity .3s' }}>
                  <text x={x + w + 8} y={y + 16.5} fontSize="12" fill="var(--text-faint)">
                    →
                  </text>
                  <rect
                    x={x + w + 24}
                    y={y + 2}
                    width={v.length * CHAR + 16}
                    height={ROW - 14}
                    rx={10}
                    fill={isErr ? 'color-mix(in srgb, var(--bad) 14%, transparent)' : 'var(--bg-sunk)'}
                    stroke={isErr ? 'var(--bad)' : 'var(--line)'}
                  />
                  <text
                    x={x + w + 32}
                    y={y + 16}
                    fontSize="12"
                    className="mono"
                    fill={isErr ? 'var(--bad)' : 'var(--text-dim)'}
                  >
                    {v}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      {steps.length > 0 && <Stepper s={s} caption={<InlineMd text={steps[s.step].caption} />} />}
    </VizFrame>
  );
}
