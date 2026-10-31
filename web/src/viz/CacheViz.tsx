import { Stepper, useStepper, VizFrame } from './Stepper';
import { InlineMd } from './InlineMd';

type Entry = { id: string; lines: string[]; hot?: boolean; isNew?: boolean };

const RESPONSE = `{
  "project": {
    "__typename": "Project", "id": "p1",
    "name": "Taskforge",
    "issues": [
      { "__typename": "Issue", "id": "i1",
        "title": "Login page", "status": "IN_REVIEW",
        "assignee": { "__typename": "User",
                      "id": "u2", "name": "Grace" } },
      { "__typename": "Issue", "id": "i2",
        "title": "Dark mode", "status": "TODO",
        "assignee": { "__typename": "User",
                      "id": "u2", "name": "Grace" } }
    ]
  }
}`;

const STEPS: { caption: string; entries: Entry[]; left?: string; leftTitle?: string }[] = [
  {
    caption:
      'A query result arrives. Apollo Client doesn\'t store it as one blob. It walks it and looks for objects with **`__typename` + `id`** (Apollo adds `__typename` to your queries automatically).',
    entries: [],
  },
  {
    caption:
      'Each such object becomes **one entry**, keyed `Typename:id`. Notice Grace appears **twice** in the response but only **once** in the cache.',
    entries: [
      { id: 'User:u2', lines: ['name: "Grace"'], hot: true },
      { id: 'Issue:i1', lines: ['title: "Login page"', 'status: "IN_REVIEW"', 'assignee: → User:u2'], hot: true },
      { id: 'Issue:i2', lines: ['title: "Dark mode"', 'status: "TODO"', 'assignee: → User:u2'], hot: true },
      { id: 'Project:p1', lines: ['name: "Taskforge"', 'issues: [→ Issue:i1, → Issue:i2]'], hot: true },
    ],
  },
  {
    caption:
      'Nested objects are replaced by **references** (`→ Issue:i1`). The root query field stores a reference too — **including its arguments** in the field name. Different arguments, different cache field.',
    entries: [
      { id: 'ROOT_QUERY', lines: ['project({"key":"TF"}): → Project:p1'], hot: true },
      { id: 'Project:p1', lines: ['name: "Taskforge"', 'issues: [→ Issue:i1, → Issue:i2]'] },
      { id: 'Issue:i1', lines: ['title: "Login page"', 'status: "IN_REVIEW"', 'assignee: → User:u2'] },
      { id: 'Issue:i2', lines: ['title: "Dark mode"', 'status: "TODO"', 'assignee: → User:u2'] },
      { id: 'User:u2', lines: ['name: "Grace"'] },
    ],
  },
  {
    caption:
      'Now a mutation: `updateIssue(id: "i1", input: { status: DONE }) { id status }`. Its result is `Issue:i1` with a new `status`. Apollo **merges** it into the existing entry…',
    left: `mutation {
  updateIssue(id: "i1",
              input: { status: DONE }) {
    id
    status
  }
}

→ { "updateIssue": {
      "__typename": "Issue",
      "id": "i1", "status": "DONE" } }`,
    leftTitle: 'mutation + result',
    entries: [
      { id: 'ROOT_QUERY', lines: ['project({"key":"TF"}): → Project:p1'] },
      { id: 'Project:p1', lines: ['name: "Taskforge"', 'issues: [→ Issue:i1, → Issue:i2]'] },
      { id: 'Issue:i1', lines: ['title: "Login page"', 'status: "DONE"  ← merged', 'assignee: → User:u2'], hot: true },
      { id: 'Issue:i2', lines: ['title: "Dark mode"', 'status: "TODO"', 'assignee: → User:u2'] },
      { id: 'User:u2', lines: ['name: "Grace"'] },
    ],
  },
  {
    caption:
      '…and **every component** showing `Issue:i1` re-renders with DONE — the list, the detail panel, the board — with zero extra code. This is the payoff of normalization, and why `id` must be in your selections: **no id, no merge**.',
    entries: [
      { id: 'Issue:i1', lines: ['status: "DONE"'], hot: true },
    ],
    left: `<IssueList>    re-renders ✓
<IssueDetail>  re-renders ✓
<Board>        re-renders ✓`,
    leftTitle: 'watchers',
  },
  {
    caption:
      'But `createIssue` returns a **new** entity, `Issue:i3`. It gets its own entry — and **no list references it**. `Project:p1.issues` still says `[i1, i2]`. Apollo can\'t know the new issue belongs in that list (or which filtered lists). Adding to and removing from lists is **your job**: refetch, or update the cache yourself.',
    left: `mutation {
  createIssue(input: {…}) {
    id title status
  }
}`,
    leftTitle: 'a create',
    entries: [
      { id: 'Project:p1', lines: ['issues: [→ Issue:i1, → Issue:i2]   ← unchanged!'], hot: true },
      { id: 'Issue:i3', lines: ['title: "Keyboard shortcuts"', 'status: "TODO"'], isNew: true },
    ],
  },
];

export function CacheViz() {
  const s = useStepper(STEPS.length);
  const step = STEPS[s.step];
  const box: React.CSSProperties = {
    fontFamily: 'var(--mono)',
    fontSize: 12,
    lineHeight: 1.55,
    background: 'var(--code-bg)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: '8px 10px',
    whiteSpace: 'pre',
    overflowX: 'auto',
  };
  return (
    <VizFrame title="The normalized cache, step by step" s={s}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
        <div>
          <div className="pane-label" style={{ padding: '0 0 4px' }}>{step.leftTitle ?? 'query result'}</div>
          <div style={{ ...box, minHeight: 260 }}>{step.left ?? RESPONSE}</div>
        </div>
        <div>
          <div className="pane-label" style={{ padding: '0 0 4px' }}>cache (client.cache.extract())</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {step.entries.length === 0 && <div style={{ ...box, color: 'var(--text-faint)' }}>(empty)</div>}
            {step.entries.map((e) => (
              <div
                key={e.id}
                style={{
                  ...box,
                  whiteSpace: 'normal',
                  borderColor: e.isNew ? 'var(--ok)' : e.hot ? 'var(--forge)' : 'var(--line)',
                  background: e.hot || e.isNew ? 'color-mix(in srgb, var(--react) 8%, var(--code-bg))' : 'var(--code-bg)',
                  transition: 'all .3s',
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--react)' }}>
                  {e.id} {e.isNew && <span style={{ color: 'var(--ok)' }}>(new)</span>}
                </div>
                {e.lines.map((l, i) => (
                  <div key={i} style={{ paddingLeft: 12, color: l.includes('←') ? 'var(--forge)' : 'var(--text-dim)' }}>
                    {l}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <Stepper s={s} caption={<InlineMd text={step.caption} />} />
    </VizFrame>
  );
}
