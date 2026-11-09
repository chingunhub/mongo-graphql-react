// The AI mentor's chat drawer. The learner brings an Anthropic or OpenAI key. See docs/mentor/PLAN.md.
import { useEffect, useRef, useState } from 'react';
import { Markdown } from './Markdown';

type ProviderId = 'anthropic' | 'openai';
type Step = { kind: 'thinking' | 'note' | 'tool'; text: string };
interface Msg {
  role: 'user' | 'assistant';
  text: string;
  steps?: Step[];
  effort?: string;
  model?: string;
  cost?: number | null;
  error?: string;
}
interface ProviderStatus {
  id: ProviderId;
  name: string;
  keyPlaceholder: string;
  hasKey: boolean;
  remembered: boolean;
  models: string[];
  defaultModel: string;
  efforts: string[];
  defaultEffort: string;
}
interface Status {
  provider: ProviderId;
  model: string;
  providers: ProviderStatus[];
  keystore: { kind: 'dpapi' | 'keychain' | 'none'; where: string };
  summaries: boolean;
}

const EFFORT_HELP: Record<string, string> = {
  none: 'none: answers at once, no reasoning. Cheapest.',
  low: 'low: a little reasoning. Fast.',
  medium: 'medium: the default. A good balance.',
  high: 'high: thinks longer. Slower, costs more.',
  xhigh: 'xhigh: for hard debugging. Slow.',
  max: 'max: the most reasoning. Slowest and most expensive.',
};

const KEY_PAGES: Record<ProviderId, string> = {
  anthropic: 'console.anthropic.com',
  openai: 'platform.openai.com',
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

const money = (n?: number | null) =>
  n === null ? 'cost unknown' : n === undefined ? '' : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`;

const stored = (name: string) => {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
};
const store = (name: string, value: string) => {
  try {
    localStorage.setItem(name, value);
  } catch {
    /* private window: keep it for this visit only */
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

function KeyForm({
  status,
  initial,
  onDone,
  onCancel,
}: {
  status: Status;
  initial: ProviderId;
  onDone: (p: ProviderStatus & { model: string; warning?: string }) => void;
  onCancel?: () => void;
}) {
  const [provider, setProvider] = useState<ProviderId>(initial);
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const p = status.providers.find((x) => x.id === provider)!;
  const canRemember = status.keystore.kind !== 'none';

  async function submit() {
    setChecking(true);
    setError('');
    try {
      const r = await json<ProviderStatus & { model: string; warning?: string }>('/api/mentor/key', {
        method: 'POST',
        body: JSON.stringify({ provider, key, remember: canRemember && remember }),
      });
      setKey('');
      onDone(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <form
      className="mentor-key"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="mentor-field">
        Provider
        <select value={provider} onChange={(e) => setProvider(e.target.value as ProviderId)}>
          {status.providers.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
              {x.hasKey ? ' (key added)' : ''}
            </option>
          ))}
        </select>
      </label>
      <p>
        Paste an {p.name} API key from {KEY_PAGES[provider]}. It goes only to {p.name}, and each message costs a little
        on your {p.name} account.
      </p>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={p.keyPlaceholder}
        aria-label={`${p.name} API key`}
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
      {canRemember && (
        <label className="mentor-check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>
            Remember on this computer
            <small>
              {remember
                ? `Saved in ${status.keystore.where}. "Forget key" removes it.`
                : 'Off: the key is gone when Forge Academy stops.'}
            </small>
          </span>
        </label>
      )}
      <div className="mentor-key-actions">
        <button className="btn primary small" disabled={!key.trim() || checking}>
          {checking ? 'Checking…' : 'Use this key'}
        </button>
        {onCancel && (
          <button type="button" className="btn small" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {error && <p className="mentor-error">{error}</p>}
    </form>
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
  const [failed, setFailed] = useState(false);
  /** Showing the key form for this provider, on top of a working chat. */
  const [adding, setAdding] = useState<ProviderId | null>(null);
  const [notice, setNotice] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [usage, setUsage] = useState('');
  const [efforts, setEfforts] = useState<Record<string, string | null>>(() => ({
    anthropic: stored('forge-mentor-effort-anthropic'),
    openai: stored('forge-mentor-effort-openai') ?? stored('forge-mentor-effort'),
  }));
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    json<Status>('/api/mentor/status').then(setStatus, () => setFailed(true));
  }, []);

  const provider = status?.providers.find((p) => p.id === status.provider) ?? null;
  const model = status?.model ?? '';

  // Refresh the model list once the panel knows a key works; the status only has the suggestions after a restart.
  useEffect(() => {
    if (!provider?.hasKey) return;
    const id = provider.id;
    json<{ models: string[] }>(`/api/mentor/models?provider=${id}`).then(
      (r) =>
        setStatus((s) =>
          s ? { ...s, providers: s.providers.map((p) => (p.id === id ? { ...p, models: r.models } : p)) } : s,
        ),
      () => {},
    );
  }, [provider?.id, provider?.hasKey]);

  useEffect(() => {
    setMessages([]);
    setUsage('');
    if (!itemKey || !provider) return;
    json<{ messages: Msg[] }>(
      `/api/mentor/thread?item=${encodeURIComponent(itemKey)}&provider=${provider.id}`,
    ).then(
      (r) => setMessages(r.messages),
      () => {},
    );
  }, [itemKey, provider?.id]);

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

  const wanted = provider ? efforts[provider.id] : null;
  const chosenEffort =
    provider && wanted && provider.efforts.includes(wanted) ? wanted : (provider?.defaultEffort ?? 'medium');
  const setEffort = (e: string) => {
    if (!provider) return;
    setEfforts((all) => ({ ...all, [provider.id]: e }));
    store(`forge-mentor-effort-${provider.id}`, e);
  };

  const patchLast = (fn: (m: Msg) => Msg) =>
    setMessages((ms) => (ms.length ? [...ms.slice(0, -1), fn(ms[ms.length - 1])] : ms));

  async function choose(next: ProviderId, nextModel: string) {
    if (!status || busy) return;
    if (next === status.provider && nextModel === model) return;
    const restarts = next === status.provider && messages.length > 0;
    if (restarts && !confirm('Another model starts a new chat for this item. Switch?')) return;
    if (restarts && itemKey) {
      await json(`/api/mentor/thread?item=${encodeURIComponent(itemKey)}&provider=${next}`, { method: 'DELETE' }).catch(
        () => {},
      );
      setMessages([]);
      setUsage('');
    }
    await json('/api/mentor/prefs', { method: 'PUT', body: JSON.stringify({ provider: next, model: nextModel }) }).catch(
      () => {},
    );
    setStatus({ ...status, provider: next, model: nextModel });
  }

  function keyAdded(p: ProviderStatus & { model: string; warning?: string }) {
    setStatus((s) =>
      s
        ? {
            ...s,
            provider: p.id,
            model: p.model,
            providers: s.providers.map((x) => (x.id === p.id ? { ...p } : x)),
          }
        : s,
    );
    setAdding(null);
    setNotice(p.warning ?? '');
  }

  async function forgetKey() {
    if (!provider || !status) return;
    const r = await json<ProviderStatus>(`/api/mentor/key?provider=${provider.id}`, { method: 'DELETE' }).catch(
      (e: Error) => {
        setNotice(e.message);
        return null;
      },
    );
    const providers = status.providers.map((x) => (x.id === provider.id ? (r ?? { ...x, hasKey: false }) : x));
    const other = providers.find((x) => x.hasKey);
    setMessages([]);
    setStatus({ ...status, providers, provider: other?.id ?? provider.id, model: other?.defaultModel ?? model });
    if (other) void choose(other.id, other.defaultModel);
  }

  async function newChat() {
    if (!itemKey || busy || !provider) return;
    await json(`/api/mentor/thread?item=${encodeURIComponent(itemKey)}&provider=${provider.id}`, {
      method: 'DELETE',
    }).catch(() => {});
    setMessages([]);
    setUsage('');
  }

  async function send(text?: string) {
    const message = (text ?? draft).trim();
    if (!message || !itemKey || busy || !provider) return;
    if (text === undefined) setDraft('');
    setBusy(true);
    setNotice('');
    setMessages((ms) => [
      ...ms,
      { role: 'user', text: message },
      { role: 'assistant', text: '', steps: [], effort: chosenEffort, model },
    ]);
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const res = await fetch('/api/mentor/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemKey, message, effort: chosenEffort, provider: provider.id, model }),
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
              `last request: ${ev.input ?? 0} in, ${pct}% cached, ${ev.output ?? 0} out` +
                (ev.reasoning !== undefined ? ` (${ev.reasoning} reasoning)` : '') +
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

  const unknownCost = messages.some((m) => m.cost === null);
  const total = messages.reduce((s, m) => s + (m.cost ?? 0), 0);
  const withKeys = status?.providers.filter((p) => p.hasKey) ?? [];
  const showForm = status && (adding || !provider?.hasKey);
  const ready = status && provider?.hasKey && !adding && itemKey;

  return (
    <aside className="mentor-panel" aria-label="Mentor">
      <header className="mentor-head">
        <b>Mentor</b>
        {status && withKeys.length > 0 && !showForm && (
          <select
            className="mentor-pick"
            aria-label="Model"
            value={`${status.provider}|${model}`}
            disabled={busy}
            onChange={(e) => {
              const [p, m] = e.target.value.split('|') as [ProviderId | 'add', string];
              if (p === 'add') setAdding(m as ProviderId);
              else void choose(p, m);
            }}
          >
            {withKeys.map((p) => (
              <optgroup key={p.id} label={p.name}>
                {(p.models.includes(model) || p.id !== status.provider ? p.models : [model, ...p.models]).map((m) => (
                  <option key={m} value={`${p.id}|${m}`}>
                    {m}
                  </option>
                ))}
              </optgroup>
            ))}
            {status.providers
              .filter((p) => !p.hasKey)
              .map((p) => (
                <option key={p.id} value={`add|${p.id}`}>
                  Add {p.name} key…
                </option>
              ))}
          </select>
        )}
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

      {failed ? (
        <p className="mentor-note">Can't reach the mentor routes.</p>
      ) : !status ? null : showForm ? (
        <KeyForm
          status={status}
          initial={adding ?? status.provider}
          onDone={keyAdded}
          onCancel={withKeys.length ? () => setAdding(null) : undefined}
        />
      ) : !itemKey ? (
        <p className="mentor-note">Open a lesson or exercise to chat about it.</p>
      ) : (
        <>
          {notice && <p className="mentor-error mentor-notice">{notice}</p>}
          <div className="mentor-log">
            {!messages.length && (
              <div className="mentor-empty">
                <p className="mentor-note">
                  Ask about this {itemKind === 'lesson' ? 'lesson' : 'exercise'}, or start with one of these:
                </p>
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
                  {m.role === 'assistant' && !live && (m.cost === null || (m.cost ?? 0) > 0) && (
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
            {(total > 0 || unknownCost) && (
              <span>
                This chat: {money(total)}
                {unknownCost ? ' + unknown' : ''}
              </span>
            )}
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
                title={`Reasoning effort. ${EFFORT_HELP[chosenEffort] ?? ''}`}
                aria-label="Reasoning effort"
              >
                {provider!.efforts.map((e) => (
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
            <button
              className="mentor-forget"
              onClick={forgetKey}
              disabled={busy}
              title={provider!.remembered ? `Also removes the copy in ${status.keystore.where}` : undefined}
            >
              Forget {provider!.name} key{provider!.remembered ? ' (remembered)' : ''}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
