import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, type CompileError, type LaunchInfo } from '../api';
import { useCurriculum } from '../App';
import { onLinkClick } from '../router';
import { GraphQLTry } from './GraphQLTry';
import { ProjectFiles, type SourceMode } from './ProjectFiles';
import { ProjectMap } from './ProjectMap';
import { describeItems, isDone } from './moduleProgress';
import {
  taskforgeJourney,
  taskforgeJourneyOptions,
  taskforgeLayers,
  taskforgeStages,
  type TaskforgeJourney,
} from '../../../shared/taskforge';

const MODES: SourceMode[] = [
  {
    id: 'mine',
    label: 'My Taskforge',
    list: 'mine',
    notice:
      'Your saved code, the starters of steps ahead of you, and supplied files. You edit a file inside the step that owns it.',
  },
  {
    id: 'compare',
    label: 'Compare with reference',
    list: 'reference',
    compare: true,
    notice:
      'Only code from steps you have passed appears here, so nothing ahead of you is spoiled. A difference is not a mistake: your tests passed, and this is one other way to write it.',
  },
];

const QUERY = 'query Projects {\n  projects {\n    key\n    name\n    issueCount\n  }\n}';
const BOARD =
  'query Issues {\n  project(key: "TF") {\n    name\n    issues(limit: 5) {\n      key\n      title\n      status\n      assignee { name }\n    }\n  }\n}';
const ME = 'query Me {\n  me {\n    name\n    email\n    role\n  }\n}';

export function TaskforgePage() {
  const { data } = useCurriculum();
  const modules = (data?.modules ?? []).filter((mod) => mod.number >= 1 && mod.number <= 13);
  const steps = modules.flatMap((mod) => mod.items).filter((item) => item.workspace === 'taskforge');
  const passed = steps.filter((step) => step.status === 'passed').length;
  const [tab, setTab] = useState<'map' | 'files' | 'path' | 'run'>('map');
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    rootRef.current?.closest('main')?.scrollTo({ top: 0 });
  }, [tab]);
  const [file, setFile] = useState('server/models/User.ts');
  const [source, setSource] = useState('mine');
  function openFile(path: string) {
    setFile(path);
    setTab('files');
  }
  const [info, setInfo] = useState<LaunchInfo | null>(null);
  const [webErrors, setWebErrors] = useState<CompileError[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [frameKey, setFrameKey] = useState(0);
  useEffect(() => {
    api
      .launchStatus()
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, [passed]);
  async function launch(reseed = false) {
    setBusy(true);
    setError('');
    try {
      const result = await api.launch(reseed);
      setInfo(result.server);
      setWebErrors(result.web && !result.web.ok ? (result.web.compileErrors ?? []) : null);
      setFrameKey((key) => key + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const stage = info?.stage ?? null;
  const running = info?.status === 'running';
  const current = modules.find((mod) => mod.items.some((item) => !isDone(item)));
  return (
    <div ref={rootRef} className="home relaydesk-page">
      <nav className="project-switch" aria-label="Project chapters">
        <a href="/taskforge" aria-current="page" onClick={onLinkClick}>
          Taskforge · foundations
        </a>
        <a href="/relaydesk" onClick={onLinkClick}>
          Relaydesk · connected systems
        </a>
      </nav>
      {tab === 'map' ? (
        <section className="hero">
          <span className="relaydesk-eyebrow">YOUR FIRST PROJECT · MODULES 1–13</span>
          <h1>
            Build an issue tracker <span style={{ color: 'var(--forge)' }}>from the database up.</span>
          </h1>
          <p>
            A Mongoose data layer, a GraphQL API with auth, DataLoader and cursor pagination, and a React +
            Apollo Client board. Each forge step adds to the code you already wrote.
          </p>
        </section>
      ) : (
        <header className="relay-project-heading">
          <h1>Taskforge</h1>
          <p>Your full-stack workspace</p>
        </header>
      )}
      <nav className="relay-tabs" aria-label="Taskforge views">
        {(
          [
            ['map', 'Architecture map'],
            ['files', 'Project files'],
            ['path', 'Build path'],
            ['run', 'Run'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        <span>
          {passed}/{steps.length} built
        </span>
      </nav>
      {tab === 'map' && (
        <ProjectMap
          name="Taskforge"
          workspace="taskforge"
          layers={taskforgeLayers}
          journeys={taskforgeJourneyOptions}
          framesFor={(id) => taskforgeJourney(id as TaskforgeJourney)}
          firstPiece="user"
          intro="Every forge step owns real files. Select a piece to see why it exists and where you build it."
          openFile={openFile}
        />
      )}
      {tab === 'files' && (
        <ProjectFiles
          selected={file}
          choose={setFile}
          mode={source}
          setMode={setSource}
          modes={MODES}
          listFiles={api.taskforgeSource}
          readFile={api.taskforgeFile}
          ownerLabel="Open the step that owns this file →"
          emptyText="Pass your first forge step and its files will appear here."
        />
      )}
      {tab === 'path' && (
        <>
          <h2 className="section-title">Everything between you and the finished app</h2>
          <p className="section-sub">
            Each module lists what it still holds, so you always know how much is left before the next one.
          </p>
          <div className="taskforge-path">
            {modules.map((mod) => {
              const left = mod.items.filter((item) => !isDone(item));
              return (
                <details className="card taskforge-module" key={mod.id} open={mod === current}>
                  <summary>
                    <span className="taskforge-module-number">
                      {left.length ? String(mod.number).padStart(2, '0') : '✓'}
                    </span>
                    <span>
                      <strong>{mod.title}</strong>
                      <small>
                        {left.length ? describeItems(left) + ' left' : 'Finished'}
                        {mod === current ? ' · you are here' : ''}
                      </small>
                    </span>
                  </summary>
                  <ol>
                    {mod.items.map((item) => (
                      <li key={item.key} className={isDone(item) ? 'done' : ''}>
                        <a href={'/learn/' + item.key} onClick={onLinkClick}>
                          <span aria-hidden="true">{isDone(item) ? '✓' : '·'}</span>
                          <span>{item.title}</span>
                          <small>{describeItems([item]).replace(/^1 /, '')}</small>
                        </a>
                      </li>
                    ))}
                  </ol>
                </details>
              );
            })}
          </div>
          <section className="card relay-ownership">
            <h3>When can you call this yours?</h3>
            <p>Passing the forge steps shows that specified behavior works. Owning a codebase takes more:</p>
            <ol>
              <li>Trace a click on the board to the document it changes, without opening the reference.</li>
              <li>
                <a href="/learn/m13/b1-stale-names" onClick={onLinkClick}>
                  Debug a failure in your own code
                </a>{' '}
                that you did not write the bug for.
              </li>
              <li>
                <a href="/learn/m13/d1-pin-issues" onClick={onLinkClick}>
                  Add a feature from a product brief
                </a>{' '}
                with no step-by-step guide.
              </li>
              <li>Explain what you changed, why, and what it still does not do, in a short change note.</li>
            </ol>
          </section>
        </>
      )}
      {tab === 'run' && (
        <>
          <h2 className="section-title">Run what you have built</h2>
          {stage ? (
            <>
              <section className="card taskforge-stage">
                <h3>{stage.title}</h3>
                <p>{stage.detail}</p>
                <div className="relaydesk-actions">
                  <button className="btn primary" disabled={busy} onClick={() => void launch(false)}>
                    {busy ? <span className="spinner" /> : '▶'} {running ? 'Rebuild & restart' : 'Launch'}
                  </button>
                  <button className="btn" disabled={busy} onClick={() => void launch(true)}>
                    Reset demo data
                  </button>
                  <span className="taskforge-status">
                    <span className={'status-dot ' + info?.status} /> server {info?.status}
                  </span>
                  {running && stage.web && (
                    <a className="btn small" href="/launch/" target="_blank" rel="noreferrer">
                      Open in new window ↗
                    </a>
                  )}
                </div>
                <p className="section-sub">
                  Runs your saved code from {info?.count} of {info?.total} steps on its own demo database,
                  including any unfinished edits you have saved for the next step.
                  {stage.web === 'app' && (
                    <>
                      {' '}
                      Log in as <code>ada@taskforge.dev</code> / <code>password123</code>.
                    </>
                  )}
                </p>
              </section>
              {webErrors?.map((e, i) => (
                <div className="compile-error" key={i}>
                  <span className="where">
                    {e.file}:{e.line}:{e.column}
                  </span>{' '}
                  {e.text}
                </div>
              ))}
              {running && (
                <div key={frameKey + stage.id} className="taskforge-explorer">
                  <GraphQLTry target="mine" source={QUERY} />
                  <GraphQLTry target="mine" source={BOARD} />
                  {stage.auth && <GraphQLTry target="mine" source={ME + '\n---variables---\n---token---\ndemo'} />}
                </div>
              )}
              {running && stage.web && !webErrors && (
                <div className="card taskforge-frame">
                  <iframe key={frameKey} className="preview-frame" src="/launch/" title="Your Taskforge" />
                </div>
              )}
              {info && !running && info.log.length > 0 && (
                <pre className="card taskforge-log">{info.log.join('\n')}</pre>
              )}
            </>
          ) : (
            <section className="card taskforge-stage">
              <h3>Nothing runs yet, and that is expected</h3>
              <p>
                Models and repositories have no way in from the outside. Module 7 gives your code an API, and
                from then on you can run the latest step you passed.
              </p>
            </section>
          )}
          {info?.next && (
            <p className="section-sub">
              Next unlock: <strong>{info.next.stage.title}</strong>,{' '}
              {info.next.stepsAway === 1 ? '1 forge step' : info.next.stepsAway + ' forge steps'} away.
            </p>
          )}
          <details className="card relaydesk-notes">
            <summary>What unlocks when</summary>
            <ol>
              {taskforgeStages.map((s) => (
                <li key={s.id}>
                  <strong>{s.title}.</strong> {s.detail}
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
      {error && (
        <pre className="compile-error" role="alert">
          {error}
        </pre>
      )}
    </div>
  );
}
