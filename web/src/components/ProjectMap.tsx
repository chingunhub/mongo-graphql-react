import { useState, type CSSProperties } from 'react';
import type { JourneyFrame, ProjectLayer } from '../../../shared/relaydesk';
import { useCurriculum } from '../App';
import { onLinkClick } from '../router';
import { CodeBlock } from './CodeBlock';

export function ProjectMap({
  name,
  workspace,
  layers,
  journeys,
  framesFor,
  firstPiece,
  intro,
  openFile,
}: {
  name: string;
  workspace: string;
  layers: ProjectLayer[];
  journeys: { id: string; label: string }[];
  framesFor: (id: string) => JourneyFrame[];
  firstPiece: string;
  intro: string;
  openFile: (path: string) => void;
}) {
  const { data } = useCurriculum();
  const items = (data?.modules ?? []).flatMap((m) => m.items);
  const next = items.find((i) => i.workspace === workspace && i.status !== 'passed')?.key;
  const pieces = layers.flatMap((layer) => layer.pieces);
  const [selected, setSelected] = useState(firstPiece);
  const [journey, setJourney] = useState(journeys[0].id);
  const [index, setIndex] = useState(0);
  const frames = framesFor(journey);
  const frame = frames[index];
  const piece = pieces.find((p) => p.id === selected)!;
  function move(to: number) {
    setIndex(to);
    setSelected(frames[to].at);
  }
  return (
    <>
      <h2 className="section-title">What you'll build</h2>
      <p className="section-sub">
        {intro}
      </p>
      <div className="card relay-map-card">
        <div className="forge-map relay-map" aria-label={name + ' architecture'}>
          {layers.map((layer) => (
            <div className="layer" key={layer.name} style={{ '--layer': layer.color } as CSSProperties}>
              <div className="layer-name">{layer.name}</div>
              <div className="layer-pieces">
                {layer.pieces.map((p) => {
                  const built = p.step && items.find((i) => i.key === p.step)?.status === 'passed';
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={p.id === selected}
                      className={
                        'piece' +
                        (built ? ' built' : '') +
                        (p.step === next ? ' next' : '') +
                        (p.id === selected ? ' selected' : '') +
                        (frame.at === p.id ? ' trace-active' : '')
                      }
                      onClick={() => setSelected(p.id)}
                    >
                      <span>
                        {built ? '✓ ' : ''}
                        {p.label}
                      </span>
                      <small>
                        {p.role === 'build'
                          ? built
                            ? 'Built'
                            : p.step === next
                              ? 'Next build'
                              : 'You build'
                          : p.role === 'provided'
                            ? 'Supplied'
                            : 'Tooling'}
                      </small>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="relay-piece-detail" aria-live="polite">
          <div>
            <strong>{piece.label}</strong>
            <code>{piece.file}</code>
            <p>{piece.why}</p>
          </div>
          <div className="btn-row">
            <button className="btn primary small" onClick={() => openFile(piece.file)}>
              Open file
            </button>
            {(piece.step || piece.lesson) && (
              <a className="btn small" href={'/learn/' + (piece.step ?? piece.lesson)} onClick={onLinkClick}>
                {piece.role === 'build' ? 'Build this piece →' : piece.step ? 'Open its step →' : 'Read the lesson →'}
              </a>
            )}
          </div>
        </div>
      </div>
      <h2 className="section-title">Follow a request through the system</h2>
      <p className="section-sub">
        Step through the completed design. This is an explanatory model; inspect live requests and persisted
        state in Run.
      </p>
      <section className="card relay-journey" aria-label={name + ' request walkthrough'}>
        <div className="relay-journey-top">
          <label>
            Journey{' '}
            <select
              aria-label="Journey"
              value={journey}
              onChange={(e) => {
                const kind = e.target.value;
                setJourney(kind);
                setIndex(0);
                setSelected(framesFor(kind)[0].at);
              }}
            >
              {journeys.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
          </label>
          <span>
            Step {index + 1} of {frames.length}
          </span>
        </div>
        <ol className="relay-trace-stops">
          {frames.map((f, i) => (
            <li key={i}>
              <button
                className={i === index ? 'current' : ''}
                aria-current={i === index ? 'step' : undefined}
                aria-label={'Step ' + (i + 1) + ': ' + f.title}
                onClick={() => move(i)}
              >
                {i + 1}
              </button>
            </li>
          ))}
        </ol>
        <div aria-live="polite">
          <h3>{frame.title}</h3>
          <p>{frame.detail}</p>
          {frame.intent && (
            <p className="relay-state">
              <span>
                Intent: <b>{frame.intent}</b>
              </span>
              <span>
                Activity receipts: <b>{frame.activities}</b>
              </span>
            </p>
          )}
          <CodeBlock code={frame.payload} lang="text" showLang={false} />
        </div>
        <div className="btn-row">
          <button className="btn small" disabled={index === 0} onClick={() => move(index - 1)}>
            ← Previous
          </button>
          <button
            className="btn primary small"
            disabled={index === frames.length - 1}
            onClick={() => move(index + 1)}
          >
            Next →
          </button>
          <button className="btn small" disabled={index === 0} onClick={() => move(0)}>
            Reset trace
          </button>
          <button
            className="btn small"
            onClick={() => openFile(pieces.find((p) => p.id === frame.at)!.file)}
          >
            Open responsible file
          </button>
        </div>
      </section>
    </>
  );
}
