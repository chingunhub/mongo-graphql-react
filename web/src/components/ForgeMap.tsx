import { useCurriculum } from '../App';
import { t, type StringKey } from '../i18n';
import { onLinkClick } from '../router';

const LAYERS: { name: string; color: string; pieces: { step: string; label: string; text?: StringKey }[] }[] = [
  {
    name: 'React client',
    color: 'var(--react)',
    pieces: [
      { step: 'f10-issue-list', label: 'apollo.ts' },
      { step: 'f10-issue-list', label: '<IssueList>' },
      { step: 'f11-create-move', label: '<CreateIssueForm>' },
      { step: 'f11-create-move', label: '<StatusSelect>' },
      { step: 'f12-board', label: '<IssueCard> fragment' },
      { step: 'f12-board', label: '<Board> pagination' },
    ],
  },
  {
    name: 'GraphQL API',
    color: 'var(--gql)',
    pieces: [
      { step: 'f6-schema', label: 'schema/*.ts' },
      { step: 'f7-resolvers', label: 'resolvers/*.ts' },
      { step: 'f8-auth', label: 'context.ts + auth' },
      { step: 'f8-auth', label: 'errors.ts' },
      { step: 'f9-loaders', label: 'loaders.ts' },
      { step: 'f9-connections', label: 'pagination.ts' },
      { step: 'f9-connections', label: 'search union' },
      { step: 'f13-boot', label: 'index.ts startServer' },
    ],
  },
  {
    name: 'Mongoose data',
    color: 'var(--mongo)',
    pieces: [
      { step: 'f1-user-model', label: 'User' },
      { step: 'f2-projects-issues', label: 'Project' },
      { step: 'f2-projects-issues', label: 'Issue' },
      { step: 'f3-issue-repository', label: 'repositories/issues.ts' },
      { step: 'f4-comments', label: 'Comment + populate' },
      { step: 'f5-passwords', label: 'password hooks', text: 'forge.passwords' },
      { step: 'f5-numbers-stats', label: 'Counter + stats' },
    ],
  },
  {
    name: 'Full stack',
    color: 'var(--forge)',
    pieces: [{ step: 'f13-due-dates', label: 'due dates, every layer', text: 'forge.dueDates' }],
  },
];

export function ForgeMap() {
  const { data } = useCurriculum();
  const steps = (data?.modules ?? []).flatMap((m) => m.items).filter((i) => i.workspace === 'taskforge');
  const byId = new Map(steps.map((s) => [s.id, s]));
  const nextStep = steps.find((s) => s.status !== 'passed');
  return (
    <div className="forge-map">
      {LAYERS.map((layer) => (
        <div className="layer" key={layer.name} style={{ '--layer': layer.color } as React.CSSProperties}>
          <div className="layer-name">{layer.name}</div>
          <div className="layer-pieces">
            {layer.pieces.map((p, i) => {
              const st = byId.get(p.step);
              const built = st?.status === 'passed';
              const next = !built && st && st.key === nextStep?.key;
              return (
                <a
                  key={i}
                  className={'piece' + (built ? ' built' : '') + (next ? ' next' : '')}
                  href={st ? `/learn/${st.key}` : undefined}
                  onClick={onLinkClick}
                  title={st ? st.title : 'coming soon'}
                >
                  {built ? '✓ ' : ''}
                  {p.text ? t(p.text) : p.label}
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
