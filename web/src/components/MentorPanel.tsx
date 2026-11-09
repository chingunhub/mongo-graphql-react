// Phase 0 spike: a bare chat drawer for the AI mentor. See docs/mentor/PLAN.md.
import { useEffect, useRef, useState } from 'react';
import { Markdown } from './Markdown';

type Step = { kind: 'thinking' | 'note' | 'tool'; text: string };
interface Msg {
  role: 'user' | 'assistant';
  text: string;
  steps?: Step[];
  effort?: string;
  cost?: number;
  error?: string;
}
interface Status {
  hasKey: boolean;
  model: string;
  efforts: string[];
  defaultEffort: string;
  summaries: boolean;
}

const EFFORT_HELP: Record<string, string> = {
  none: 'none: answers at once, no reasoning. Cheapest.',
  low: 'low: a little reasoning. Fast.',
  medium: "medium: OpenAI's default. A good balance.",
  high: 'high: thinks longer. Slower, costs more.',
  xhigh: 'xhigh: for hard debugging. Slow.',
  max: 'max: the most reasoning. Slowest and most expensive.',
};

const STARTERS = {
  task: ['Why are my tests failing?', 'What should I do next?', 'Explain the idea behind this exercise'],
  lesson: ['Explain the main idea simply', 'Quiz me on this lesson', 'Give me another example'],
};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

const money = (n?: number) => (n === undefined ? '' : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`);

const readEffort = () => {
  try {
    return localStorage.getItem('forge-mentor-effort');
  } catch {
    return null;
  }
};

function Steps({ steps, live }: { steps: Step[]; live: boolean }) {
  return (
    <>
      {steps.map((s, i) =>
        s.kind === 'tool' ? (
          <div key={i} className="mentor-tool">
            {s.text}
          </div>
        ) : s.kind === 'note' ? (
          <div key={i} className="mentor-step-note">
            {s.text}
          </div>
        ) : s.text.trim() ? (
          <details key={i} className="mentor-thinking" open={live && i === steps.length - 1}>
            <summary>Thinking</summary>
            <Markdown text={s.text} />
          </details>
        ) : null,
      )}
    </>
  );
}

export function MentorPanel({
  itemKey,
  itemKind,
  onClose,
}: {
  itemKey: string | null;
  itemKind: 'lesson' | 'task' | null;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [keyError, setKeyError] = useState('');
  const [checking, setChecking] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [usage, setUsage] = useState('');
  const [effort, setEffortState] = useState<string | null>(readEffort);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    json<Status>('/api/mentor/status').then(setStatus, () => setStatus(null));
  }, []);

  useEffect(() => {
    setMessages([]);
    setUsage('');
    if (!itemKey) return;
    json<{ messages: Msg[] }>(`/api/mentor/thread?item=${encodeURIComponent(itemKey)}`).then(
      (r) => setMessages(r.messages),
      () => {},
    );
  }, [itemKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [busy]);

  const chosenEffort =
    effort && status?.efforts.includes(effort) ? effort : (status?.defaultEffort ?? 'medium');
  const setEffort = (e: string) => {
    setEffortState(e);
    try {
      localStorage.setItem('forge-mentor-effort', e);
    } catch {
      /* private window: keep it for this visit only */
    }
  };

  const patchLast = (fn: (m: Msg) => Msg) =>
    setMessages((ms) => (ms.length ? [...ms.slice(0, -1), fn(ms[ms.length - 1])] : ms));

  async function saveKey() {
    setChecking(true);
    setKeyError('');
    try {
      await json('/api/mentor/key', { method: 'POST', body: JSON.stringify({ key: keyDraft }) });
      setKeyDraft('');
      setStatus((s) => (s ? { ...s, hasKey: true } : s));
    } catch (e) {
      setKeyError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function forgetKey() {
    await json('/api/mentor/key', { method: 'DELETE' }).catch(() => {});
    setStatus((s) => (s ? { ...s, hasKey: false } : s));
  }

  async function newChat() {
    if (!itemKey || busy) return;
    await json(`/api/mentor/thread?item=${encodeURIComponent(itemKey)}`, { method: 'DELETE' }).catch(() => {});
    setMessages([]);
    setUsage('');
  }

  async function send(text?: string) {
    const message = (text ?? draft).trim();
    if (!message || !itemKey || busy) return;
    if (text === undefined) setDraft('');
    setBusy(true);
    setMessages((ms) => [
      ...ms,
      { role: 'user', text: message },
      { role: 'assistant', text: '', steps: [], effort: chosenEffort },
    ]);
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const res = await fetch('/api/mentor/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemKey, message, effort: chosenEffort }),
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let cut: number;
        while ((cut = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, cut);
          buf = buf.slice(cut + 2);
          if (!chunk.startsWith('data: ')) continue;
          const ev = JSON.parse(chunk.slice(6));
          if (ev.type === 'text') patchLast((m) => ({ ...m, text: m.text + ev.delta }));
          else if (ev.type === 'step')
            patchLast((m) => {
              const steps = [...(m.steps ?? [])];
              const last = steps.at(-1);
              if (ev.append && last && last.kind === ev.kind) steps[steps.length - 1] = { ...last, text: last.text + ev.text };
              else steps.push({ kind: ev.kind, text: ev.text });
              return { ...m, steps };
            });
          else if (ev.type === 'usage') {
            patchLast((m) => ({ ...m, cost: ev.cost }));
            const pct = ev.input ? Math.round(((ev.cached ?? 0) / ev.input) * 100) : 0;
            setUsage(
              `last request: ${ev.input ?? 0} in, ${pct}% cached, ${ev.output ?? 0} out (${ev.reasoning ?? 0} reasoning)` +
                (ev.cacheMiss ? `, cache miss: ${ev.cacheMiss}` : ''),
            );
          } else if (ev.type === 'error') patchLast((m) => ({ ...m, error: ev.message }));
        }
      }
    } catch (e) {
      const msg = (e as Error).name === 'AbortError' ? 'Stopped.' : (e as Error).message;
      patchLast((m) => ({ ...m, error: msg }));
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  const total = messages.reduce((s, m) => s + (m.cost ?? 0), 0);
  const ready = status?.hasKey && itemKey;

  return (
    <aside className="mentor-panel" aria-label="Mentor">
      <header className="mentor-head">
        <b>Mentor</b>
        <span className="mentor-model">{status?.model ?? ''}</span>
        <div className="spacer" />
        {ready && (
          <button className="btn small" onClick={newChat} disabled={busy || !messages.length}>
            New chat
          </button>
        )}
        <button className="icon-btn" onClick={onClose} title="Close">
          ✕
        </button>
      </header>

      {!status ? (
        <p className="mentor-note">Can't reach the mentor routes.</p>
      ) : !status.hasKey ? (
        <form
          className="mentor-key"
          onSubmit={(e) => {
            e.preventDefault();
            void saveKey();
          }}
        >
          <p>
            Paste an OpenAI API key. It stays in this app's memory until the server stops, and goes only to OpenAI.
            Each message costs a little on your OpenAI account.
          </p>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-..."
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
          />
          <button className="btn primary small" disabled={!keyDraft.trim() || checking}>
            {checking ? 'Checking…' : 'Use this key'}
          </button>
          {keyError && <p className="mentor-error">{keyError}</p>}
        </form>
      ) : !itemKey ? (
        <p className="mentor-note">Open a lesson or exercise to chat about it.</p>
      ) : (
        <>
          <div className="mentor-log">
            {!messages.length && (
              <div className="mentor-empty">
                <p className="mentor-note">Ask about this {itemKind === 'lesson' ? 'lesson' : 'exercise'}, or start with one of these:</p>
                {STARTERS[itemKind ?? 'task'].map((s) => (
                  <button key={s} className="mentor-starter" onClick={() => void send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => {
              const live = busy && i === messages.length - 1;
              return (
                <div key={i} className={'mentor-msg ' + m.role}>
                  {m.steps && <Steps steps={m.steps} live={live && !m.text} />}
                  {m.role === 'user' ? (
                    <p>{m.text}</p>
                  ) : m.text ? (
                    <Markdown text={m.text} />
                  ) : live && !m.error ? (
                    <p className="mentor-note">Working… {elapsed}s</p>
                  ) : null}
                  {m.error && <p className="mentor-error">{m.error}</p>}
                  {m.role === 'assistant' && !live && (m.cost ?? 0) > 0 && (
                    <div className="mentor-cost">
                      {m.effort ? `${m.effort} · ` : ''}
                      {money(m.cost)}
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          <div className="mentor-meta">
            {total > 0 && <span>This chat: {money(total)}</span>}
            {usage && <span title={usage}>{usage}</span>}
          </div>
          <form
            className="mentor-input"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              rows={3}
              value={draft}
              placeholder="Message the mentor (Enter sends, Shift+Enter for a new line)"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <div className="mentor-actions">
              <select
                value={chosenEffort}
                onChange={(e) => setEffort(e.target.value)}
                title={`Reasoning effort. ${EFFORT_HELP[chosenEffort] ?? ''} Changing it mid-chat keeps the cache.`}
                aria-label="Reasoning effort"
              >
                {status.efforts.map((e) => (
                  <option key={e} value={e} title={EFFORT_HELP[e]}>
                    {e}
                  </option>
                ))}
              </select>
              {busy ? (
                <button type="button" className="btn small" onClick={() => abortRef.current?.abort()}>
                  Stop
                </button>
              ) : (
                <button className="btn primary small" disabled={!draft.trim()}>
                  Send
                </button>
              )}
            </div>
          </form>
          <div className="mentor-foot">
            <span>{EFFORT_HELP[chosenEffort]}</span>
            <button className="mentor-forget" onClick={forgetKey} disabled={busy}>
              Forget key
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
