import { useState } from 'react';
import { VizFrame } from './Stepper';
import {
  WORKSPACE_GRAPH,
  cacheTrace,
  deliveryTrace,
  dualWriteTrace,
  loaderTrace,
  optimisticTrace,
  reach,
  retryRun,
  type BackoffKind,
  type CacheMode,
  type CrashPoint,
  type GraphDirection,
  type LoaderMode,
  type MutationOutcome,
  type Status,
  type WriteCrash,
  type WriteStrategy,
} from './systemModels';

function Controls({ step, count, set }: { step: number; count: number; set: (n: number) => void }) {
  return (
    <div className="system-controls">
      <button className="btn small" disabled={step === 0} onClick={() => set(step - 1)}>
        ← Previous
      </button>
      <span aria-label="Frame">
        {step + 1} / {count}
      </span>
      <button className="btn small" disabled={step === count - 1} onClick={() => set(step + 1)}>
        Next →
      </button>
      <button className="btn small" onClick={() => set(0)}>
        Reset trace
      </button>
    </div>
  );
}
export function TenantCacheLab() {
  const [mode, setMode] = useState<CacheMode>('shared');
  const [first, setFirst] = useState<'north' | 'south'>('north');
  const [step, setStep] = useState(0);
  const frames = cacheTrace(mode, first),
    frame = frames[step];
  return (
    <VizFrame title="Experiment · can a correct query return the wrong tenant?">
      <div className="system-options">
        <label>
          Loader lifetime
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as CacheMode);
              setStep(0);
            }}
          >
            <option value="shared">Shared across requests</option>
            <option value="request">One per request</option>
          </select>
        </label>
        <label>
          First request
          <select
            value={first}
            onChange={(e) => {
              setFirst(e.target.value as 'north' | 'south');
              setStep(0);
            }}
          >
            <option value="north">North</option>
            <option value="south">South</option>
          </select>
        </label>
      </div>
      <div className="system-stations">
        {['Requested tenant + ID', 'Loader cache', 'Returned record'].map((title, i) => (
          <div key={title} className={frame.active === i ? 'active' : ''}>
            <span>{title}</span>
            <strong>{i === 0 ? frame.tenant + ' / booking 7' : i === 1 ? frame.cache : frame.returned}</strong>
          </div>
        ))}
      </div>
      <div className={'system-observation' + (frame.leaked ? ' danger' : '')} aria-live="polite">
        <strong>{frame.title}</strong>
        <p>{frame.detail}</p>
        <span>
          Database reads: {frame.reads}
          {frame.leaked ? ' · Wrong tenant returned' : ''}
        </span>
      </div>
      <Controls step={step} count={frames.length} set={setStep} />
      <p className="system-prompt">
        Try the other lifetime, then reverse the request order. Which input is missing from the shared cache identity?
      </p>
    </VizFrame>
  );
}
export function DeliveryLab() {
  const [crash, setCrash] = useState<CrashPoint>('after-effect');
  const [idempotent, setIdempotent] = useState(true);
  const [step, setStep] = useState(0);
  const [prediction, setPrediction] = useState<number | null>(null);
  const frames = deliveryTrace(crash, idempotent),
    frame = frames[Math.min(step, frames.length - 1)];
  const reset = () => {
    setStep(0);
    setPrediction(null);
  };
  return (
    <VizFrame title="Experiment · stop the worker at the worst moment">
      <div className="system-options">
        <label>
          Crash point
          <select
            value={crash}
            onChange={(e) => {
              setCrash(e.target.value as CrashPoint);
              reset();
            }}
          >
            <option value="before-effect">Before effect</option>
            <option value="after-effect">After effect, before acknowledgement</option>
            <option value="after-ack">After acknowledgement</option>
          </select>
        </label>
        <label>
          Consumer
          <select
            value={idempotent ? 'receipt' : 'counter'}
            onChange={(e) => {
              setIdempotent(e.target.value === 'receipt');
              reset();
            }}
          >
            <option value="receipt">Durable unique receipt</option>
            <option value="counter">Naive increment</option>
          </select>
        </label>
      </div>
      <div className="system-prediction">
        <span>Predict the final activity count:</span>
        {[0, 1, 2].map((n) => (
          <button
            key={n}
            className={'btn small' + (prediction === n ? ' primary' : '')}
            aria-pressed={prediction === n}
            onClick={() => setPrediction(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="system-stations">
        {['Stored intent', 'Worker attempts', 'Activity effects'].map((title, i) => (
          <div key={title} className={frame.stage === i ? 'active' : ''}>
            <span>{title}</span>
            <strong>
              {i === 0 ? (frame.pending ? 'pending' : 'acknowledged') : i === 1 ? frame.attempts : frame.effects}
            </strong>
          </div>
        ))}
      </div>
      <div className={'system-observation' + (frame.effects > 1 ? ' danger' : '')} aria-live="polite">
        <strong>{frame.title}</strong>
        <p>{frame.detail}</p>
        <span>Durable receipt: {frame.receipt ? 'present' : 'absent'}</span>
      </div>
      <Controls step={step} count={frames.length} set={setStep} />
      {step === frames.length - 1 && prediction !== null && (
        <p className="system-feedback">
          {prediction === frame.effects ? 'Prediction matched.' : 'Prediction differed:'} Final activities:{' '}
          {frame.effects}.{' '}
          {frame.effects > 1
            ? 'The effect repeated across the acknowledgement gap.'
            : 'Now explain which stored fact made recovery safe.'}
        </p>
      )}
      <p className="system-prompt">
        Deterministic state model. The exercises test the corresponding MongoDB and BullMQ behavior.
      </p>
    </VizFrame>
  );
}
const GRAPH_LAYOUT: Record<string, [number, number]> = {
  'reservation-screen': [20, 16],
  'admin-console': [340, 16],
  reservations: [20, 116],
  catalogue: [240, 116],
  contracts: [130, 216],
  'ui-kit': [460, 116],
};
const NODE = { w: 170, h: 40 };
export function BlastRadiusLab() {
  const [changed, setChanged] = useState('contracts');
  const [direction, setDirection] = useState<GraphDirection>('consumers');
  const lit = reach(WORKSPACE_GRAPH, changed, direction);
  const names = Object.keys(GRAPH_LAYOUT);
  return (
    <VizFrame title="Experiment · which way does a change travel?">
      <div className="system-options">
        <label>
          Question
          <select value={direction} onChange={(e) => setDirection(e.target.value as GraphDirection)}>
            <option value="consumers">What might this change break?</option>
            <option value="dependencies">What must exist before this builds?</option>
          </select>
        </label>
      </div>
      <svg className="system-graph" viewBox="0 0 650 270" role="group" aria-label="Project dependency graph">
        <defs>
          <marker id="system-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" className="system-graph-head" />
          </marker>
        </defs>
        {names.flatMap((name) =>
          WORKSPACE_GRAPH[name].map((need) => {
            const [x1, y1] = GRAPH_LAYOUT[name],
              [x2, y2] = GRAPH_LAYOUT[need];
            return (
              <line
                key={name + need}
                className={lit.includes(name) && lit.includes(need) ? 'lit' : ''}
                x1={x1 + NODE.w / 2}
                y1={y1 + NODE.h}
                x2={x2 + NODE.w / 2}
                y2={y2}
                markerEnd="url(#system-arrow)"
              />
            );
          }),
        )}
        {names.map((name) => {
          const [x, y] = GRAPH_LAYOUT[name];
          const state = name === changed ? 'changed' : lit.includes(name) ? 'lit' : '';
          return (
            <g
              key={name}
              className={'system-graph-node ' + state}
              role="button"
              tabIndex={0}
              aria-pressed={name === changed}
              aria-label={name}
              onClick={() => setChanged(name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setChanged(name);
                }
              }}
            >
              <rect x={x} y={y} width={NODE.w} height={NODE.h} rx={8} />
              <text x={x + NODE.w / 2} y={y + 25} textAnchor="middle">
                {name}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="system-observation" aria-live="polite">
        <strong>
          {direction === 'consumers'
            ? `${lit.length} of ${names.length} projects need a re-test`
            : `${lit.length} of ${names.length} projects must exist first`}
        </strong>
        <p>{lit.join(', ')}</p>
        <span>Arrows point from a project to what it imports. Click any project.</span>
      </div>
      <p className="system-prompt">
        Click <code>contracts</code>, then <code>reservation-screen</code>, and flip the question each time. Same graph,
        opposite walks.
      </p>
    </VizFrame>
  );
}
const WRITE_VERDICT = {
  ok: 'Consistent',
  lost: 'Lost notification: row with no message',
  ghost: 'Ghost notification: message with no row',
} as const;
export function DualWriteLab() {
  const [strategy, setStrategy] = useState<WriteStrategy>('save-first');
  const [crash, setCrash] = useState<WriteCrash>('between');
  const [step, setStep] = useState(0);
  const frames = dualWriteTrace(strategy, crash),
    frame = frames[Math.min(step, frames.length - 1)];
  return (
    <VizFrame title="Experiment · two effects, one crash">
      <div className="system-options">
        <label>
          Order of work
          <select
            value={strategy}
            onChange={(e) => {
              setStrategy(e.target.value as WriteStrategy);
              setStep(0);
            }}
          >
            <option value="save-first">Save, then send</option>
            <option value="publish-first">Send, then save</option>
            <option value="stored-intent">Save row + intent, dispatch later</option>
          </select>
        </label>
        <label>
          Process
          <select
            value={crash}
            onChange={(e) => {
              setCrash(e.target.value as WriteCrash);
              setStep(0);
            }}
          >
            <option value="between">Dies between the two effects</option>
            <option value="none">Runs to the end</option>
          </select>
        </label>
      </div>
      <div className="system-stations">
        {['Database', 'Reader', 'This process'].map((title, i) => (
          <div key={title} className={frame.stage === i ? 'active' : ''}>
            <span>{title}</span>
            <strong>
              {i === 0
                ? (frame.saved ? 'row saved' : 'no row') + (frame.owed ? ' + message owed' : '')
                : i === 1
                  ? frame.sent
                    ? 'told'
                    : 'not told'
                  : frame.title === 'Process dies'
                    ? 'dead'
                    : 'running'}
            </strong>
          </div>
        ))}
      </div>
      <div
        className={'system-observation' + (frame.verdict === 'lost' || frame.verdict === 'ghost' ? ' danger' : '')}
        aria-live="polite"
      >
        <strong>{frame.title}</strong>
        <p>{frame.detail}</p>
        {frame.verdict && <span>{WRITE_VERDICT[frame.verdict]}</span>}
      </div>
      <Controls step={step} count={frames.length} set={setStep} />
      <p className="system-prompt">
        Crash each order. Which is the only one where the database still knows what it owes the reader?
      </p>
    </VizFrame>
  );
}
export function RetryLab() {
  const [budget, setBudget] = useState(4);
  const [kind, setKind] = useState<BackoffKind>('exponential');
  const [failures, setFailures] = useState(2);
  const run = retryRun(budget, kind, 250, failures);
  const span = Math.max(run.totalMs, 1);
  return (
    <VizFrame title="Experiment · spend a retry budget">
      <div className="system-options">
        <label>
          attempts
          <select value={budget} onChange={(e) => setBudget(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          backoff (delay: 250)
          <select value={kind} onChange={(e) => setKind(e.target.value as BackoffKind)}>
            <option value="exponential">exponential</option>
            <option value="fixed">fixed</option>
          </select>
        </label>
        <label>
          Dependency stays down for
          <select value={failures} onChange={(e) => setFailures(Number(e.target.value))}>
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'attempt' : 'attempts'}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ol className="system-timeline" aria-label="Attempts">
        {run.attempts.map((a) => (
          <li key={a.attempt} className={a.outcome} style={{ left: (a.at / span) * 94 + '%' }}>
            <b>{a.attempt}</b>
            <span>{a.at} ms</span>
          </li>
        ))}
      </ol>
      <div className={'system-observation' + (run.state === 'failed' ? ' danger' : '')} aria-live="polite">
        <strong>{run.state === 'completed' ? 'Job completed' : 'Job failed: budget spent'}</strong>
        <p>
          {run.attempts
            .map((a) => (a.attempt === 1 ? 'try' : `wait ${a.waited} ms, try`) + (a.outcome === 'failed' ? ' ✘' : ' ✔'))
            .join(' → ')}
        </p>
        <span>
          {run.attempts.length} of {budget} attempts used, {run.totalMs} ms after the first
        </span>
      </div>
      <p className="system-prompt">
        Set the outage to 4 and compare fixed with exponential. Which one gives a struggling dependency time to recover?
      </p>
    </VizFrame>
  );
}

export function LoaderLab() {
  const [mode, setMode] = useState<LoaderMode>('plain');
  const [issues, setIssues] = useState(20);
  const [varied, setVaried] = useState(false);
  const [step, setStep] = useState(0);
  const [prediction, setPrediction] = useState<number | null>(null);
  const people = varied ? issues : 3;
  const frames = loaderTrace(mode, issues, people);
  const frame = frames[Math.min(step, frames.length - 1)];
  const reset = () => {
    setStep(0);
    setPrediction(null);
  };
  return (
    <VizFrame title="Experiment · how many queries does one page cost?">
      <div className="system-options">
        <label>
          Assignee resolver
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as LoaderMode);
              reset();
            }}
          >
            <option value="plain">User.findById per issue</option>
            <option value="loader">DataLoader</option>
          </select>
        </label>
        <label>
          Issues on the page
          <select
            value={issues}
            onChange={(e) => {
              setIssues(Number(e.target.value));
              reset();
            }}
          >
            {[5, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Assignees
          <select
            value={varied ? 'all' : 'few'}
            onChange={(e) => {
              setVaried(e.target.value === 'all');
              reset();
            }}
          >
            <option value="few">3 people share them</option>
            <option value="all">A different person each</option>
          </select>
        </label>
      </div>
      <div className="system-prediction">
        <span>Predict the total queries:</span>
        {[...new Set([2, people + 1, issues + 1])].map((n) => (
          <button
            key={n}
            className={'btn small' + (prediction === n ? ' primary' : '')}
            aria-pressed={prediction === n}
            onClick={() => setPrediction(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="system-stations">
        {['Resolvers finished', 'Ids waiting', 'MongoDB queries'].map((title, i) => (
          <div key={title} className={frame.active === i ? 'active' : ''}>
            <span>{title}</span>
            <strong>{i === 0 ? frame.resolved + ' of ' + issues : i === 1 ? frame.queued : frame.queries}</strong>
          </div>
        ))}
      </div>
      <div className={'system-observation' + (frame.final && frame.queries > 2 ? ' danger' : '')} aria-live="polite">
        <strong>{frame.title}</strong>
        <p>{frame.detail}</p>
        <span>Assignee queries so far: {frame.queries - 1}</span>
      </div>
      <Controls step={step} count={frames.length} set={setStep} />
      {frame.final && prediction !== null && (
        <p className="system-feedback">
          {prediction === frame.queries ? 'Prediction matched.' : 'Prediction differed:'} This page cost {frame.queries}{' '}
          queries.
        </p>
      )}
      <p className="system-prompt">
        Give every issue a different assignee and compare both resolvers. With nothing to deduplicate, what is
        DataLoader still saving?
      </p>
    </VizFrame>
  );
}

export function OptimisticLab() {
  const [optimistic, setOptimistic] = useState(true);
  const [outcome, setOutcome] = useState<MutationOutcome>('failure');
  const [step, setStep] = useState(0);
  const [prediction, setPrediction] = useState<Status | null>(null);
  const frames = optimisticTrace(optimistic, outcome);
  const frame = frames[step];
  const reset = () => {
    setStep(0);
    setPrediction(null);
  };
  return (
    <VizFrame title="Experiment · what happens to a guess the server refuses?">
      <div className="system-options">
        <label>
          On click
          <select
            value={optimistic ? 'optimistic' : 'wait'}
            onChange={(e) => {
              setOptimistic(e.target.value === 'optimistic');
              reset();
            }}
          >
            <option value="optimistic">Send optimisticResponse</option>
            <option value="wait">Wait for the server</option>
          </select>
        </label>
        <label>
          Server answer
          <select
            value={outcome}
            onChange={(e) => {
              setOutcome(e.target.value as MutationOutcome);
              reset();
            }}
          >
            <option value="failure">Refuses the change</option>
            <option value="success">Accepts the change</option>
          </select>
        </label>
      </div>
      <div className="system-prediction">
        <span>Moving TF-7 to DONE. Predict where the card ends:</span>
        {(['TODO', 'DONE'] as const).map((status) => (
          <button
            key={status}
            className={'btn small' + (prediction === status ? ' primary' : '')}
            aria-pressed={prediction === status}
            onClick={() => setPrediction(status)}
          >
            {status}
          </button>
        ))}
      </div>
      <div className="system-stations">
        {['Card on screen', 'Optimistic layer', 'Normalized cache'].map((title, i) => (
          <div key={title} className={frame.active === i ? 'active' : ''}>
            <span>{title}</span>
            <strong>
              {i === 0 ? frame.card + (frame.note ? ' · ' + frame.note : '') : i === 1 ? frame.layer : frame.cache}
            </strong>
          </div>
        ))}
      </div>
      <div className={'system-observation' + (frame.rolledBack ? ' danger' : '')} aria-live="polite">
        <strong>{frame.title}</strong>
        <p>{frame.detail}</p>
        <span>Server: {frame.server}</span>
      </div>
      <Controls step={step} count={frames.length} set={setStep} />
      {step === frames.length - 1 && prediction !== null && (
        <p className="system-feedback">
          {prediction === frame.card ? 'Prediction matched.' : 'Prediction differed:'} The card ends in {frame.card}.
        </p>
      )}
      <p className="system-prompt">
        Go back to the waiting frame with a refusal selected. Which of the three boxes still holds the truth?
      </p>
    </VizFrame>
  );
}
