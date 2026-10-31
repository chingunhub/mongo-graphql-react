import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, type RelaydeskService } from '../api';
import { useCurriculum } from '../App';
import { onLinkClick } from '../router';
import { RelaydeskMap } from './RelaydeskMap';
import { RelaydeskFiles } from './RelaydeskFiles';
import { RELAYDESK_BOOT } from '../../../shared/relaydesk';

export function RelaydeskPage() {
  const { data } = useCurriculum();
  const steps = (data?.modules ?? [])
    .flatMap((module) => module.items)
    .filter((item) => item.workspace === 'relaydesk');
  const passed = steps.filter((step) => step.status === 'passed').length;
  const complete = steps.length > 0 && passed === steps.length;
  const bootIndex = steps.findIndex((s) => s.key === RELAYDESK_BOOT);
  const ready = bootIndex >= 0 && steps.slice(0, bootIndex + 1).every((s) => s.status === 'passed');
  const [tab, setTab] = useState<'map' | 'files' | 'path' | 'run'>('map');
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    rootRef.current?.closest('main')?.scrollTo({ top: 0 });
  }, [tab]);
  const [file, setFile] = useState('web/SupportInbox.tsx');
  const [source, setSource] = useState<'mine' | 'reference'>('mine');
  function openFile(path: string) {
    setFile(path);
    setTab('files');
  }
  const [services, setServices] = useState<Record<'mine' | 'reference', RelaydeskService> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [redis, setRedis] = useState(false);
  const [view, setView] = useState<'mine' | 'reference' | null>(null);
  const [exported, setExported] = useState<{
    directory: string;
    mode: string;
    complete: boolean;
  } | null>(null);
  useEffect(() => {
    api
      .relaydesk()
      .then((result) => setServices(result.services))
      .catch((error) => setError(error.message));
  }, []);
  async function start(kind: 'mine' | 'reference') {
    setBusy(kind);
    setError('');
    try {
      const service = await api.startRelaydesk(kind, redis);
      setServices((current) => ({ ...current!, [kind]: service }));
      if (service.status === 'running') setView(kind);
      else setError(service.log.slice(-8).join('\n') || 'The project did not start.');
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function stop(kind: 'mine' | 'reference') {
    setBusy('stop');
    setError('');
    try {
      await api.stopRelaydesk(kind);
      setServices((await api.relaydesk()).services);
      if (view === kind) setView(null);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function exportSource(kind: 'mine' | 'reference') {
    setBusy('export');
    setError('');
    try {
      setExported(await api.exportRelaydesk(kind));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div ref={rootRef} className="home relaydesk-page">
      <nav className="project-switch" aria-label="Project chapters">
        <a href="/taskforge" onClick={onLinkClick}>
          Taskforge · foundations
        </a>
        <a href="/relaydesk" aria-current="page" onClick={onLinkClick}>
          Relaydesk · connected systems
        </a>
      </nav>
      {tab === 'map' ? (
        <section className="hero">
          <span className="relaydesk-eyebrow">YOUR SECOND PROJECT · MODULES 14–23</span>
          <h1>
            Build systems you can <span style={{ color: 'var(--forge)' }}>explain under failure.</span>
          </h1>
          <p>
            A support platform you build across data, APIs, background work and React. Follow the
            architecture, inspect every file, then replace the supplied adapters and inbox with your own code.
          </p>
          <p className="section-sub">
            Mongoose · Apollo Federation · tRPC + Zod · BullMQ + Memurai / Redis · React + Apollo · React Hook
            Form · Nx + pnpm · GraphQL Code Generator
          </p>
        </section>
      ) : (
        <header className="relay-project-heading">
          <h1>Relaydesk</h1>
          <p>Your connected-system workspace</p>
        </header>
      )}
      <nav className="relay-tabs" aria-label="Relaydesk views">
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
      {tab === 'map' && <RelaydeskMap openFile={openFile} />}
      {tab === 'files' && (
        <RelaydeskFiles
          selected={file}
          choose={setFile}
          mode={source}
          setMode={setSource}
          exportSource={() => void exportSource(source)}
          busy={!!busy}
        />
      )}
      {tab === 'path' && (
        <>
          <h2 className="section-title">Construction → integration → ownership</h2>
          <p className="section-sub">
            The first nine checkpoints reach a runnable system. Four more transfer its transport and frontend
            behavior into your hands. Drills and bug hunts prepare each step.
          </p>
          {[
            {
              title: 'Build the connected foundation',
              steps: steps.slice(0, bootIndex + 1),
            },
            {
              title: 'Own the HTTP, queue and React boundaries',
              steps: steps.slice(bootIndex + 1),
            },
          ].map((group) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              <div className="relaydesk-steps">
                {group.steps.map((step) => (
                  <a
                    className="card relaydesk-step"
                    key={step.key}
                    href={'/learn/' + step.key}
                    onClick={onLinkClick}
                  >
                    <span>
                      {step.status === 'passed' ? '✓' : String(steps.indexOf(step) + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <strong>{step.title.replace('Relaydesk: ', '')}</strong>
                      <p>{step.summary}</p>
                    </div>
                    <span className="step-state">
                      {step.status === 'passed' ? 'Passed' : step.locked ? 'Later' : 'Open →'}
                    </span>
                  </a>
                ))}
              </div>
            </section>
          ))}
          <section className="card relay-ownership">
            <h3>When can you call this yours?</h3>
            <p>
              Checkpoint tests show that specified behaviors work. Independent ownership needs more evidence:
            </p>
            <ol>
              <li>
                Trace a UI action to its persisted effect and explain each boundary without reference code.
              </li>
              <li>Reproduce an unfamiliar failure, isolate its cause, and add a regression test.</li>
              <li>
                Build an independent feature through the GraphQL contract, generated types and React view.
              </li>
              <li>Explain the tradeoffs and limitations of your change in a reviewable change note.</li>
            </ol>
            <p>
              The final inbox lesson supplies an independent priority-filter brief. Its open-ended work is not
              automatically graded or counted as completed mastery.
            </p>
            <a href="/learn/m23/l2-view-states" onClick={onLinkClick}>
              Read the independent change brief →
            </a>
          </section>
        </>
      )}
      {tab === 'run' && (
        <>
          <h2 className="section-title">Run the system</h2>
          <p className="section-sub">
            The reference demo and your project have separate databases. Both use synthetic local accounts.
            Reference activity does not mark lessons or checkpoints complete.
          </p>
          <label className="relaydesk-transport">
            <input
              type="checkbox"
              checked={redis}
              onChange={(event) => setRedis(event.target.checked)}
              disabled={!!busy}
            />{' '}
            On next launch, use real BullMQ through Memurai / Redis on port 6397
          </label>
          {redis && (
            <p className="section-sub">
              Start the isolated queue service with <code>npm run queue:lab</code> in this project. Delivery
              waits for the worker's result. With this option off, the same consumer runs directly.
            </p>
          )}
          <div className="relaydesk-launch-grid">
            {(['reference', 'mine'] as const).map((kind) => (
              <section className="card relaydesk-launch" key={kind}>
                <h3>{kind === 'reference' ? 'Reference demo' : 'Your Relaydesk'}</h3>
                <p>
                  {kind === 'reference'
                    ? 'Explore the completed behavior before building it.'
                    : 'Runs your saved code from the latest complete stage, starting with the foundation.'}
                </p>
                <div className="relaydesk-actions">
                  <button
                    className="btn primary"
                    disabled={!!busy || (kind === 'mine' && !ready)}
                    onClick={() => void start(kind)}
                  >
                    {busy === kind
                      ? 'Starting…'
                      : services?.[kind]?.status === 'running'
                        ? 'Rebuild & restart'
                        : 'Launch'}
                  </button>
                  {services?.[kind]?.status === 'running' && (
                    <>
                      <button className="btn" disabled={!!busy} onClick={() => setView(kind)}>
                        Show
                      </button>
                      <button className="btn" disabled={!!busy} onClick={() => void stop(kind)}>
                        Stop
                      </button>
                    </>
                  )}
                  <button className="btn" disabled={!!busy} onClick={() => void exportSource(kind)}>
                    Export source
                  </button>
                </div>
                <p className="section-sub">
                  {services?.[kind]?.status ?? 'stopped'}
                  {kind === 'mine' && !ready
                    ? ' · Complete the foundation through Start, integrate, recover to launch'
                    : ''}
                </p>
              </section>
            ))}
          </div>
          {view && services?.[view]?.status === 'running' && (
            <section className="relaydesk-preview">
              <div>
                <strong>{view === 'reference' ? 'Reference demo' : 'Your saved implementation'}</strong>
                <a className="btn small" target="_blank" rel="noreferrer" href={services[view].url}>
                  Open in new window ↗
                </a>
              </div>
              <iframe
                key={view + services[view].log.join('')}
                className="preview-frame"
                src={services[view].url}
                title={view === 'reference' ? 'Relaydesk reference demo' : 'Your Relaydesk'}
              />
            </section>
          )}

          <p className="section-sub">
            {ready && !complete
              ? 'Your latest contiguous passed stage can run while later ownership steps remain unfinished. A full export includes those later TODOs.'
              : 'Learner and reference sources remain separate. Export either explicitly to explore or edit locally.'}
          </p>
        </>
      )}
      {error && (
        <pre className="compile-error" role="alert">
          {error}
        </pre>
      )}
      {exported && (
        <div className="card relaydesk-export" role="status">
          <strong>
            {exported.mode === 'mine' ? 'Your saved workspace exported' : 'Reference source exported'}
          </strong>
          <p>
            {exported.complete
              ? 'Ready for a fresh install and checks.'
              : 'Includes unfinished TODOs; no reference answers were inserted.'}
          </p>
          <pre>
            {'cd "' +
              exported.directory.replaceAll('\\', '/') +
              '"\nnpx pnpm@9.12.3 install\nnpx pnpm@9.12.3 run build\nnpx pnpm@9.12.3 start'}
          </pre>
        </div>
      )}

      <details className="card relaydesk-notes">
        <summary>How this connects to real systems, and what comes next</summary>
        <p>
          The boundaries and technology choices follow a real open-source system, linked below. Relaydesk
          practices React, Apollo Client, React Hook Form and Zod alongside its backend. The lab uses newer
          major versions of React, Apollo and Zod than that snapshot; inspect the version notes before
          transferring API syntax.
        </p>
        <p>
          Next depth: an independent vertical feature and incident report, React Router, shared UI and state
          ownership, large tables, remote frontend deployment, migrations and independent-process recovery.
          These are future extensions, not hidden completed modules.
        </p>
        <p>
          <a
            target="_blank"
            rel="noreferrer"
            href="https://github.com/erxes/erxes/tree/5d8a3da5d6f2ccbb214f26e004eed3663e747c39"
          >
            Pinned erxes source ↗
          </a>
        </p>
      </details>
    </div>
  );
}
