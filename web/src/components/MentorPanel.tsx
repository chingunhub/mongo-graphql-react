// The AI mentor's chat drawer. The learner brings an Anthropic or OpenAI key. See docs/mentor/PLAN.md.
import { useEffect, useRef, useState } from 'react';
import { hasString, t, type StringKey } from '../i18n';
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
  /** The error's code and vars from the server, so it shows in the current language. */
  errorCode?: string;
  errorVars?: Record<string, string>;
  /** On a learner message: the project step they had moved on to. */
  moved?: string;
  /** Token counts of the last request, for the cost line's tooltip. Not saved. */
  usage?: string;
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
  session: { cost: number; unknown: boolean; replies: number };
}

/** What the drawer is about: the open item, if any. */
export interface MentorItem {
  key: string;
  kind: 'lesson' | 'task';
  title: string;
  /** "Module 3 · Board resolver" or "Taskforge step 2 · Board resolver". */
  label: string;
  /** The thread: the item key, or project-<workspace> for a forge project. */
  scope: string;
}

const KEY_PAGES: Record<ProviderId, string> = {
  anthropic: 'console.anthropic.com',
  openai: 'platform.openai.com',
};

const STARTERS: Record<'task' | 'lesson', StringKey[]> = {
  task: ['mentor.starter.task1', 'mentor.starter.task2', 'mentor.starter.task3'],
  lesson: ['mentor.starter.lesson1', 'mentor.starter.lesson2', 'mentor.starter.lesson3'],
};

const effortHelp = (e: string) =>
  ['none', 'low', 'medium', 'high', 'xhigh', 'max'].includes(e) ? t(`mentor.effort.${e}` as StringKey) : '';

/** A server error as the server sends it: English text, plus a code and vars to translate it. */
interface ServerError {
  error?: string;
  code?: string;
  vars?: Record<string, string>;
}

/** The error in the learner's language, or the server's English when there is no string for its code. */
function errorText(e: ServerError, fallback = '') {
  const key = `mentor.err.${e.code}`;
  return e.code && hasString(key) ? t(key, e.vars ?? {}) : (e.error ?? fallback);
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorText(body, `HTTP ${res.status}`));
  return body as T;
}

type KeyAdded = ProviderStatus & { model: string; warning?: ServerError };

const money = (n?: number | null) =>
  n === null ? t('mentor.costUnknown') : n === undefined ? '' : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`;

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

const threadUrl = (itemKey: string, provider: ProviderId) =>
  `/api/mentor/thread?item=${encodeURIComponent(itemKey)}&provider=${provider}`;

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
            <summary>{t('mentor.thinking')}</summary>
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
  onDone: (p: KeyAdded) => void;
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
      const r = await json<KeyAdded>('/api/mentor/key', {
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
        {t('mentor.provider')}
        <select value={provider} onChange={(e) => setProvider(e.target.value as ProviderId)}>
          {status.providers.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
              {x.hasKey ? t('mentor.keyAdded') : ''}
            </option>
          ))}
        </select>
      </label>
      <p>{t('mentor.keyIntro', { name: p.name, page: KEY_PAGES[provider] })}</p>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={p.keyPlaceholder}
        aria-label={t('mentor.keyLabel', { name: p.name })}
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
      {canRemember && (
        <label className="mentor-check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>
            {t('mentor.remember')}
            <small>
              {remember ? t('mentor.rememberOn', { where: status.keystore.where }) : t('mentor.rememberOff')}
            </small>
          </span>
        </label>
      )}
      <div className="mentor-key-actions">
        <button className="btn primary small" disabled={!key.trim() || checking}>
          {checking ? t('mentor.checking') : t('mentor.useKey')}
        </button>
        {onCancel && (
          <button type="button" className="btn small" onClick={onCancel}>
            {t('mentor.cancel')}
          </button>
        )}
      </div>
      {error && <p className="mentor-error">{error}</p>}
    </form>
  );
}

function Settings({
  status,
  busy,
  onAdd,
  onForget,
  onDeleteAll,
}: {
  status: Status;
  busy: boolean;
  onAdd: (id: ProviderId) => void;
  onForget: (id: ProviderId) => void;
  onDeleteAll: () => Promise<string>;
}) {
  const [result, setResult] = useState('');
  const { session } = status;
  return (
    <div className="mentor-settings">
      <section>
        <h4>{t('mentor.set.keys')}</h4>
        {status.providers.map((p) => (
          <div key={p.id} className="mentor-key-row">
            <div>
              <b>{p.name}</b>
              <small>
                {!p.hasKey
                  ? t('mentor.set.noKey')
                  : p.remembered
                    ? t('mentor.set.keyRemembered', { where: status.keystore.where })
                    : t('mentor.set.keySession')}
              </small>
            </div>
            <button className="btn small" onClick={() => onAdd(p.id)} disabled={busy}>
              {p.hasKey ? t('mentor.set.replace') : t('mentor.set.add')}
            </button>
            {p.hasKey && (
              <button className="btn small" onClick={() => onForget(p.id)} disabled={busy}>
                {t('mentor.set.forget')}
              </button>
            )}
          </div>
        ))}
      </section>
      <section>
        <h4>{t('mentor.set.sentTitle')}</h4>
        <p>{t('mentor.set.sent')}</p>
      </section>
      <section>
        <h4>{t('mentor.set.spendTitle')}</h4>
        <p>
          {t('mentor.set.spend', { cost: money(session.cost), n: session.replies })}
          {session.unknown ? ' ' + t('mentor.set.spendUnknown') : ''} {t('mentor.set.spendNote')}
        </p>
      </section>
      <section>
        <h4>{t('mentor.set.convTitle')}</h4>
        <p>{t('mentor.set.convNote')}</p>
        <button
          className="btn small danger"
          disabled={busy}
          onClick={async () => {
            if (!confirm(t('mentor.set.deleteConfirm'))) return;
            setResult(await onDeleteAll());
          }}
        >
          {t('mentor.set.deleteAll')}
        </button>
        {result && <p className="mentor-note-inline">{result}</p>}
      </section>
    </div>
  );
}

export function MentorPanel({ item, onClose }: { item: MentorItem | null; onClose: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  /** Showing the key form for this provider. */
  const [adding, setAdding] = useState<ProviderId | null>(null);
  const [notice, setNotice] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  /** The item the thread's last message was about, to mark a move to another project step. */
  const [lastItem, setLastItem] = useState<string | null>(null);
  /** provider|scope of the thread on screen. */
  const [loaded, setLoaded] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [efforts, setEfforts] = useState<Record<string, string | null>>(() => ({
    anthropic: stored('forge-mentor-effort-anthropic'),
    openai: stored('forge-mentor-effort-openai') ?? stored('forge-mentor-effort'),
  }));
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadStatus = () => json<Status>('/api/mentor/status').then(setStatus, () => setFailed(true));
  useEffect(() => {
    void loadStatus();
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

  // Load the thread for the open item. Steps of one project share a thread, so moving between them
  // keeps the conversation on screen. A reply still streaming finishes into the thread it started in.
  const want = item && provider ? `${provider.id}|${item.scope}` : '';
  useEffect(() => {
    if (busy || want === loaded) return;
    setLoaded(want);
    setMessages([]);
    setLastItem(null);
    if (!item || !provider) return;
    json<{ messages: Msg[]; lastItem: string | null }>(threadUrl(item.key, provider.id)).then(
      (r) => {
        setMessages(r.messages);
        setLastItem(r.lastItem);
      },
      () => {},
    );
  }, [want, busy]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, view]);

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

  async function choose(next: ProviderId, nextModel: string, s: Status | null = status) {
    if (!s || busy) return;
    if (next === s.provider && nextModel === s.model) return;
    const restarts = next === s.provider && messages.length > 0;
    if (restarts && !confirm(t('mentor.switchModel'))) return;
    if (restarts && item) {
      await json(threadUrl(item.key, next), { method: 'DELETE' }).catch(() => {});
      setMessages([]);
      setLastItem(null);
    }
    await json('/api/mentor/prefs', { method: 'PUT', body: JSON.stringify({ provider: next, model: nextModel }) }).catch(
      () => {},
    );
    setStatus({ ...s, provider: next, model: nextModel });
  }

  function keyAdded(p: KeyAdded) {
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
    setNotice(p.warning ? errorText(p.warning) : '');
  }

  async function forgetKey(id: ProviderId) {
    if (!status) return;
    const r = await json<ProviderStatus>(`/api/mentor/key?provider=${id}`, { method: 'DELETE' }).catch((e: Error) => {
      setNotice(e.message);
      return null;
    });
    const providers = status.providers.map((x) => (x.id === id ? (r ?? { ...x, hasKey: false }) : x));
    const next = { ...status, providers };
    setStatus(next);
    // Forgetting the key in use moves to the other provider when it has one.
    const other = providers.find((x) => x.hasKey);
    if (id === status.provider && other) void choose(other.id, other.defaultModel, next);
  }

  async function deleteAll(): Promise<string> {
    try {
      await json('/api/mentor/threads', { method: 'DELETE' });
      setMessages([]);
      setLastItem(null);
      return t('mentor.set.deleted');
    } catch (e) {
      return (e as Error).message;
    }
  }

  async function newChat() {
    if (!item || busy || !provider) return;
    await json(threadUrl(item.key, provider.id), { method: 'DELETE' }).catch(() => {});
    setMessages([]);
    setLastItem(null);
  }

  async function send(text?: string) {
    const message = (text ?? draft).trim();
    if (!message || !item || busy || !provider) return;
    if (text === undefined) setDraft('');
    setBusy(true);
    setNotice('');
    const moved = messages.length > 0 && !!lastItem && lastItem !== item.key;
    setLastItem(item.key);
    setMessages((ms) => [
      ...ms,
      { role: 'user', text: message, ...(moved ? { moved: item.title } : {}) },
      { role: 'assistant', text: '', steps: [], effort: chosenEffort, model },
    ]);
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const res = await fetch('/api/mentor/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemKey: item.key, message, effort: chosenEffort, provider: provider.id, model }),
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(errorText(body, `HTTP ${res.status}`));
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
            if (ev.input === undefined) {
              patchLast((m) => ({ ...m, cost: ev.cost }));
              continue;
            }
            const pct = ev.input ? Math.round(((ev.cached ?? 0) / ev.input) * 100) : 0;
            const usage =
              `Last request: ${ev.input ?? 0} tokens in, ${pct}% cached, ${ev.output ?? 0} out` +
              (ev.reasoning !== undefined ? ` (${ev.reasoning} reasoning)` : '') +
              (ev.cacheMiss ? `. Cache miss: ${ev.cacheMiss}` : '');
            patchLast((m) => ({ ...m, cost: ev.cost, usage }));
          } else if (ev.type === 'error')
            patchLast((m) => ({ ...m, error: ev.message, errorCode: ev.code, errorVars: ev.vars }));
        }
      }
    } catch (e) {
      const stopped = (e as Error).name === 'AbortError';
      // A stopped request is still billed for what it produced, and no one reports how much.
      patchLast((m) => ({
        ...m,
        error: stopped ? t('mentor.stopped') : (e as Error).message,
        ...(stopped ? { errorCode: 'stopped' } : {}),
        ...(stopped ? { cost: null } : {}),
      }));
    } finally {
      abortRef.current = null;
      setBusy(false);
      // The settings show the session total.
      void loadStatus();
    }
  }

  const unknownCost = messages.some((m) => m.cost === null);
  const total = messages.reduce((s, m) => s + (m.cost ?? 0), 0);
  const withKeys = status?.providers.filter((p) => p.hasKey) ?? [];
  const showForm = status && (adding || (view === 'chat' && !provider?.hasKey));
  const ready = status && provider?.hasKey && !adding && view === 'chat' && item;
  const project = item ? item.scope !== item.key : false;

  return (
    <aside className="mentor-panel" aria-label={t('mentor.title')}>
      <header className="mentor-head">
        <b>{t('mentor.title')}</b>
        {status && withKeys.length > 0 && !showForm && view === 'chat' && (
          <select
            className="mentor-pick"
            aria-label={t('mentor.model')}
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
                  {t('mentor.addKeyOption', { name: p.name })}
                </option>
              ))}
          </select>
        )}
        <div className="spacer" />
        {ready && (
          <button className="btn small" onClick={newChat} disabled={busy || !messages.length}>
            {t('mentor.newChat')}
          </button>
        )}
        {status && (
          <button
            className={'icon-btn' + (view === 'settings' ? ' active' : '')}
            onClick={() => {
              setAdding(null);
              setView((v) => (v === 'settings' ? 'chat' : 'settings'));
              if (view === 'chat') void loadStatus();
            }}
            title={view === 'settings' ? t('mentor.set.back') : t('mentor.settings')}
            aria-label={view === 'settings' ? t('mentor.set.back') : t('mentor.settings')}
          >
            ⚙
          </button>
        )}
        <button className="icon-btn" onClick={onClose} title={t('mentor.close')} aria-label={t('mentor.close')}>
          ✕
        </button>
      </header>
      {item && view === 'chat' && !showForm && <div className="mentor-about">{item.label}</div>}

      {failed ? (
        <p className="mentor-note">{t('mentor.unreachable')}</p>
      ) : !status ? null : showForm ? (
        <KeyForm
          status={status}
          initial={adding ?? status.provider}
          onDone={keyAdded}
          onCancel={withKeys.length || view === 'settings' ? () => setAdding(null) : undefined}
        />
      ) : view === 'settings' ? (
        <>
          {notice && <p className="mentor-error mentor-notice">{notice}</p>}
          <Settings
            status={status}
            busy={busy}
            onAdd={setAdding}
            onForget={(id) => void forgetKey(id)}
            onDeleteAll={deleteAll}
          />
        </>
      ) : !item ? (
        <p className="mentor-note">{t('mentor.openItem')}</p>
      ) : (
        <>
          {notice && <p className="mentor-error mentor-notice">{notice}</p>}
          <div className="mentor-log">
            {!messages.length && (
              <div className="mentor-empty">
                <p className="mentor-note">{item.kind === 'lesson' ? t('mentor.askLesson') : t('mentor.askTask')}</p>
                {STARTERS[item.kind].map((k) => (
                  <button key={k} className="mentor-starter" onClick={() => void send(t(k))}>
                    {t(k)}
                  </button>
                ))}
                {project && <p className="mentor-note mentor-project-note">{t('mentor.projectNote')}</p>}
              </div>
            )}
            {messages.map((m, i) => {
              const live = busy && i === messages.length - 1;
              return (
                <div key={i} className="mentor-msg-wrap">
                  {m.moved && <div className="mentor-moved">{t('mentor.movedTo', { title: m.moved })}</div>}
                  <div className={'mentor-msg ' + m.role}>
                    {m.steps && <Steps steps={m.steps} live={live && !m.text} />}
                    {m.role === 'user' ? (
                      <p>{m.text}</p>
                    ) : m.text ? (
                      <Markdown text={m.text} />
                    ) : live && !m.error ? (
                      <p className="mentor-note">{t('mentor.working', { s: elapsed })}</p>
                    ) : null}
                    {m.error && <p className="mentor-error">{errorText({ error: m.error, code: m.errorCode, vars: m.errorVars })}</p>}
                    {m.role === 'assistant' && !live && (m.cost === null || (m.cost ?? 0) > 0) && (
                      <div className="mentor-cost" title={m.usage}>
                        {m.model ? `${m.model} · ` : ''}
                        {m.effort ? `${m.effort} · ` : ''}
                        {money(m.cost)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          {(total > 0 || unknownCost) && (
            <div className="mentor-meta">
              {t('mentor.thisChat', { cost: money(total) })}
              {unknownCost ? t('mentor.plusUnknown') : ''}
            </div>
          )}
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
              placeholder={t('mentor.placeholder')}
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
                title={`${t('mentor.effort')}. ${effortHelp(chosenEffort)}`}
                aria-label={t('mentor.effort')}
              >
                {provider!.efforts.map((e) => (
                  <option key={e} value={e} title={effortHelp(e)}>
                    {e}
                  </option>
                ))}
              </select>
              {busy ? (
                <button type="button" className="btn small" onClick={() => abortRef.current?.abort()}>
                  {t('mentor.stop')}
                </button>
              ) : (
                <button className="btn primary small" disabled={!draft.trim()}>
                  {t('mentor.send')}
                </button>
              )}
            </div>
          </form>
          <div className="mentor-foot">{effortHelp(chosenEffort)}</div>
        </>
      )}
    </aside>
  );
}
