import { Stepper, useStepper, VizFrame } from './Stepper';
import { InlineMd } from './InlineMd';
import { CodeBlock } from '../components/CodeBlock';
import { t, type StringKey } from '../i18n';

const LAYERS = [
  { id: 'comp', label: 'React component', sub: 'useQuery(GET_PROJECT)', color: 'var(--react)', part: 'Part III' },
  { id: 'client', label: 'Apollo Client', sub: 'InMemoryCache · links', color: 'var(--react)', part: 'Part III' },
  { id: 'http', label: 'HTTP', sub: 'POST /graphql', color: 'var(--text-faint)', part: '' },
  { id: 'server', label: 'Apollo Server', sub: 'parse → validate → execute', color: 'var(--gql)', part: 'Part II' },
  { id: 'resolvers', label: 'Resolvers', sub: '(parent, args, context)', color: 'var(--gql)', part: 'Part II' },
  { id: 'models', label: 'Mongoose models', sub: 'schemas · validation · hooks', color: 'var(--mongo)', part: 'Part I' },
  { id: 'db', label: 'MongoDB', sub: 'stack.bson', color: 'var(--mongo)', part: 'Part I' },
];

const STEPS: { at: string; dir: 'down' | 'up'; caption: StringKey; payload?: string; lang?: string }[] = [
  {
    at: 'comp',
    dir: 'down',
    caption: 'stack.1',
    payload: `const { data, loading } = useQuery(GET_PROJECT, {\n  variables: { key: "TF" },\n});`,
    lang: 'tsx',
  },
  {
    at: 'client',
    dir: 'down',
    caption: 'stack.2',
  },
  {
    at: 'http',
    dir: 'down',
    caption: 'stack.3',
    payload: `{\n  "query": "query GetProject($key: String!) { project(key: $key) { id name issues { title status } } }",\n  "variables": { "key": "TF" }\n}`,
  },
  {
    at: 'server',
    dir: 'down',
    caption: 'stack.4',
  },
  {
    at: 'resolvers',
    dir: 'down',
    caption: 'stack.5',
    payload: `Query: {\n  project: (_parent, { key }, ctx) =>\n    Project.findOne({ key }),\n}`,
    lang: 'ts',
  },
  {
    at: 'models',
    dir: 'down',
    caption: 'stack.6',
  },
  {
    at: 'db',
    dir: 'down',
    caption: 'stack.7',
    payload: `db.projects.findOne({ key: "TF" })`,
    lang: 'js',
  },
  {
    at: 'models',
    dir: 'up',
    caption: 'stack.8',
  },
  {
    at: 'resolvers',
    dir: 'up',
    caption: 'stack.9',
  },
  {
    at: 'server',
    dir: 'up',
    caption: 'stack.10',
    payload: `{\n  "data": {\n    "project": {\n      "id": "66f…a1",\n      "name": "Taskforge",\n      "issues": [{ "title": "Set up CI", "status": "DONE" }]\n    }\n  }\n}`,
  },
  {
    at: 'client',
    dir: 'up',
    caption: 'stack.11',
  },
  {
    at: 'comp',
    dir: 'up',
    caption: 'stack.12',
  },
];

export function StackMap() {
  const s = useStepper(STEPS.length);
  const cur = STEPS[s.step];
  const W = 640;
  const ROW = 58;
  const H = LAYERS.length * ROW + 8;
  const idx = LAYERS.findIndex((l) => l.id === cur.at);
  return (
    <VizFrame title={t('stack.title')} s={s}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ maxHeight: 440 }}>
        {LAYERS.map((l, i) => {
          const y = i * ROW + 4;
          const hot = i === idx;
          return (
            <g key={l.id} style={{ transition: 'opacity .3s' }} opacity={hot ? 1 : 0.62}>
              <rect
                x={120}
                y={y}
                width={360}
                height={ROW - 12}
                rx={10}
                fill={`color-mix(in srgb, ${l.color} ${hot ? 24 : 9}%, var(--bg-elev))`}
                stroke={hot ? 'var(--forge)' : l.color}
                strokeWidth={hot ? 2.4 : 1.2}
              />
              <text x={136} y={y + 20} fontSize="14" fontWeight="650" fill="var(--text)">
                {l.label}
              </text>
              <text x={136} y={y + 37} fontSize="11.5" fill="var(--text-dim)" className="mono">
                {l.sub === 'stack.bson' ? t('stack.bson') : l.sub}
              </text>
              <text x={108} y={y + 28} fontSize="11" textAnchor="end" fill={l.color} fontWeight="600">
                {l.part}
              </text>
              {i < LAYERS.length - 1 && (
                <line x1={300} x2={300} y1={y + ROW - 12} y2={y + ROW} stroke="var(--line-strong)" strokeWidth={2} />
              )}
            </g>
          );
        })}
        {/* travelling packet */}
        <g style={{ transition: 'transform .45s cubic-bezier(.4,.1,.2,1)' }} transform={`translate(0, ${idx * ROW})`}>
          <circle cx={500} cy={27} r={9} fill={cur.dir === 'down' ? 'var(--forge)' : 'var(--ok)'} />
          <text x={516} y={32} fontSize="12" fill="var(--text-dim)" fontWeight="600">
            {cur.dir === 'down' ? '▼ request' : '▲ data'}
          </text>
        </g>
      </svg>
      <Stepper s={s} caption={<InlineMd text={t(cur.caption)} />} />
      {cur.payload && (
        <div style={{ marginTop: 8 }}>
          <CodeBlock code={cur.payload} lang={cur.lang ?? 'json'} showLang={false} />
        </div>
      )}
    </VizFrame>
  );
}
