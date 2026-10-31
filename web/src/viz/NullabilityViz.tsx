import { useState } from 'react';
import { VizFrame } from './Stepper';

const TYPES = ['[String]', '[String!]', '[String]!', '[String!]!'] as const;
const VALUES = ['null', '[]', '["a", "b"]', '["a", null]'] as const;

// allowed[type][value]
const ALLOWED: Record<(typeof TYPES)[number], boolean[]> = {
  '[String]': [true, true, true, true],
  '[String!]': [true, true, true, false],
  '[String]!': [false, true, true, true],
  '[String!]!': [false, true, true, false],
};

const WHY: Record<string, string> = {
  '[String]|null': 'The list itself is nullable — "no list at all" is allowed.',
  '[String]|["a", null]': 'Items are nullable too. Anything goes.',
  '[String!]|null': 'Outer list is nullable, so null is fine.',
  '[String!]|["a", null]': 'String! means every item must be non-null. One null item breaks it.',
  '[String]!|null': 'The trailing ! says the list must exist.',
  '[String]!|["a", null]': 'The list exists; items may be null.',
  '[String!]!|null': 'The list must exist…',
  '[String!]!|["a", null]': '…and every item must be non-null.',
};

/** Which values each list/non-null combination accepts. Click a cell for the reason. */
export function NullabilityViz() {
  const [sel, setSel] = useState<string>('[String!]!|["a", null]');
  const cell = { padding: '8px 10px', textAlign: 'center' as const, fontFamily: 'var(--mono)', fontSize: 13 };
  return (
    <VizFrame title="Lists × non-null: what each type accepts">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 4, width: '100%' }}>
          <thead>
            <tr>
              <th />
              {VALUES.map((v) => (
                <th key={v} style={{ ...cell, color: 'var(--text-dim)', fontWeight: 600 }}>
                  {v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TYPES.map((t) => (
              <tr key={t}>
                <th style={{ ...cell, textAlign: 'left', color: 'var(--gql)' }}>{t}</th>
                {VALUES.map((v, i) => {
                  const ok = ALLOWED[t][i];
                  const key = `${t}|${v}`;
                  const active = sel === key;
                  return (
                    <td
                      key={v}
                      onClick={() => setSel(key)}
                      style={{
                        ...cell,
                        cursor: 'pointer',
                        borderRadius: 8,
                        border: `1.5px solid ${active ? 'var(--forge)' : 'transparent'}`,
                        background: ok
                          ? 'color-mix(in srgb, var(--ok) 13%, transparent)'
                          : 'color-mix(in srgb, var(--bad) 11%, transparent)',
                        color: ok ? 'var(--ok)' : 'var(--bad)',
                        fontWeight: 700,
                      }}
                    >
                      {ok ? '✓' : '✗'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="stepper">
        <span className="caption">
          <code>{sel.split('|')[0]}</code> with <code>{sel.split('|')[1]}</code>:{' '}
          {WHY[sel] ??
            (ALLOWED[sel.split('|')[0] as (typeof TYPES)[number]][VALUES.indexOf(sel.split('|')[1] as never)]
              ? 'Allowed — an empty or full list of non-null items is always fine.'
              : 'Not allowed.')}
        </span>
      </div>
    </VizFrame>
  );
}
