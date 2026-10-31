import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { api, type CompileError, type Files, type RunOutput, type TaskData } from '../api';
import { useCurriculum } from '../App';
import { afterThis } from './moduleProgress';
import { Markdown } from './Markdown';
import { CodeBlock } from './CodeBlock';
import { useIsDark } from './useIsDark';
import { navigate, onLinkClick } from '../router';
import { Celebrate } from './Celebrate';
import { Milestone } from './Milestone';
import { milestones, type Milestone as MilestoneInfo } from '../../../shared/stages';
import { onUnloadFlush } from '../unloadGuard';
import { Splitter, usePaneSize } from './Splitter';
import { canFormat, editorExtensions, formatView } from './editorSetup';

type LeftTab = 'brief' | 'hints' | 'solution';
type BottomTab = 'console' | 'tests' | 'preview';

const KIND_LABEL = { drill: 'Drill', forge: 'Forge step', bughunt: 'Bug hunt' } as const;

function FileTree({
  files,
  active,
  readonly,
  focus,
  onOpen,
}: {
  files: string[];
  active: string;
  readonly: Set<string>;
  focus: Set<string>;
  onOpen: (p: string) => void;
}) {
  // group by directory
  const sorted = [...files].sort((a, b) => {
    const da = a.includes('/') ? 0 : 1;
    const db = b.includes('/') ? 0 : 1;
    return da - db || a.localeCompare(b);
  });
  let lastDir = '';
  const out: React.ReactNode[] = [];
  for (const p of sorted) {
    const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
    const name = p.slice(p.lastIndexOf('/') + 1);
    if (dir !== lastDir) {
      if (dir) out.push(<div className="dir" key={'d' + dir}>▾ {dir}/</div>);
      else if (lastDir) out.push(<div className="dir" key="droot" style={{ marginTop: 6 }} />);
      lastDir = dir;
    }
    out.push(
      <button
        key={p}
        className={p === active ? 'active' : ''}
        style={{ paddingLeft: dir ? 12 + Math.min(3, dir.split('/').length) * 10 : 12 }}
        onClick={() => onOpen(p)}
        title={p}
      >
        {name}
        {readonly.has(p) ? <span className="ro">read-only</span> : focus.has(p) ? <span className="focus-dot" /> : null}
      </button>,
    );
  }
  return <div className="filetree">{out}</div>;
}

function CompileErrors({ errors, onJump }: { errors: CompileError[]; onJump: (e: CompileError) => void }) {
  return (
    <div>
      <div className="result-banner fail">
        ✗ Your code didn't compile <span className="sub">fix this first — nothing ran</span>
      </div>
      {errors.map((e, i) => (
        <div className="compile-error" key={i}>
          <a className="where" href="#" onClick={(ev) => (ev.preventDefault(), onJump(e))}>
            {e.file}
            {e.line ? `:${e.line}:${e.column}` : ''}
          </a>{' '}
          {e.text}
          {e.lineText && <div style={{ color: 'var(--text-dim)', marginTop: 4 }}>{e.lineText.trim()}</div>}
          {e.file === '(hidden tests)' && /No matching export|could not resolve|not exported/i.test(e.text) && (
            <div style={{ marginTop: 6, color: 'var(--text-dim)', fontFamily: 'var(--font)' }}>
              The tests import something your files don't export yet. Check names and <code>export</code>s against
              the brief.
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Crash({ out }: { out: RunOutput }) {
  if (!out.crashed) return null;
  const titles: Record<string, string> = {
    load: 'Your code threw while loading',
    timeout: 'Timed out',
    setup: 'Setup failed',
  };
  return (
    <div className="compile-error">
      <span className="where">{titles[out.crashed.phase] ?? 'Crashed'}</span>
      {'\n'}
      {out.crashed.message}
      {out.crashed.stack && <div style={{ color: 'var(--text-dim)', marginTop: 4 }}>{out.crashed.stack}</div>}
    </div>
  );
}

function ConsolePanel({ out, onJump }: { out: RunOutput | null; onJump: (e: CompileError) => void }) {
  if (!out) return <div className="empty">Press Run to execute playground.ts. console.log output appears here.</div>;
  if (out.compileErrors) return <CompileErrors errors={out.compileErrors} onJump={onJump} />;
  return (
    <div>
      <Crash out={out} />
      {out.logs.length === 0 && !out.crashed && <div className="empty">(no output) · ran in {out.ms}ms</div>}
      {out.logs.map((l, i) => (
        <div key={i} className={'console-line ' + l.level}>
          {l.test && <span className="tag">[{l.test}]</span>}
          {l.text}
        </div>
      ))}
    </div>
  );
}

function TestsPanel({ out, onJump }: { out: RunOutput | null; onJump: (e: CompileError) => void }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  useEffect(() => {
    // expand failures by default
    setOpen(new Set(out?.results.map((r, i) => (r.passed ? -1 : i)).filter((i) => i >= 0)));
  }, [out]);
  if (!out) return <div className="empty">Press Submit to run the hidden tests.</div>;
  if (out.compileErrors) return <CompileErrors errors={out.compileErrors} onJump={onJump} />;
  const passed = out.results.filter((r) => r.passed).length;
  return (
    <div>
      {out.ok ? (
        <div className="result-banner pass">
          ✓ All {out.results.length} tests pass <span className="sub">{out.ms}ms</span>
        </div>
      ) : out.results.length > 0 ? (
        <div className="result-banner fail">
          {passed}/{out.results.length} passing{' '}
          <span className="sub">read the first failure carefully — it's usually the one that matters</span>
        </div>
      ) : null}
      <Crash out={out} />
      {out.results.map((r, i) => (
        <div key={i} className={'test-row ' + (r.passed ? 'pass' : 'fail')}>
          <div
            className="test-row-head"
            onClick={() =>
              setOpen((s) => {
                const n = new Set(s);
                if (n.has(i)) n.delete(i);
                else n.add(i);
                return n;
              })
            }
            style={{ cursor: r.passed ? 'default' : 'pointer' }}
          >
            <span className="mark">{r.passed ? '✓' : '✗'}</span>
            {r.name}
            <span className="ms">{r.ms}ms</span>
          </div>
          {!r.passed && open.has(i) && (
            <div className="test-detail">
              <pre>{r.message}</pre>
              {r.stack && <pre style={{ color: 'var(--text-faint)', marginTop: 6 }}>{r.stack}</pre>}
              {r.hint && (
                <div className="hint">
                  <b>Nudge:</b> {r.hint}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      {out.logs.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-dim)' }}>Console output during tests ({out.logs.length})</summary>
          {out.logs.map((l, i) => (
            <div key={i} className={'console-line ' + l.level}>
              {l.test && <span className="tag">[{l.test}]</span>}
              {l.text}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

export function TaskView({ itemKey }: { itemKey: string }) {
  const [task, setTask] = useState<TaskData | null>(null);
  const [files, setFiles] = useState<Files>({});
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [active, setActive] = useState('');
  const [leftTab, setLeftTab] = useState<LeftTab>('brief');
  const [bottomTab, setBottomTab] = useState<BottomTab>('console');
  const [runOut, setRunOut] = useState<RunOutput | null>(null);
  const [testOut, setTestOut] = useState<RunOutput | null>(null);
  const [busy, setBusy] = useState<'run' | 'submit' | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [solution, setSolution] = useState<Files | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewErrors, setPreviewErrors] = useState<CompileError[] | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [milestone, setMilestone] = useState<MilestoneInfo | null>(null);
  const closeMilestone = useCallback(() => setMilestone(null), []);
  const [saved, setSaved] = useState(true);
  const [formatNote, setFormatNote] = useState<{ ok: boolean; text: string } | null>(null);
  const dark = useIsDark();
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  // Resizable panes (sizes remembered per viewer; double-click a handle to reset).
  const taskRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const [leftW, setLeftW] = usePaneSize('task-left', { min: 280, max: 1100 });
  const [treeW, setTreeW] = usePaneSize('file-tree', { min: 120, max: 480 });
  const [bottomH, setBottomH] = usePaneSize('bottom-panel', { min: 90, max: 1200 });
  const { data: curriculum, refresh, neighbors, find } = useCurriculum();
  const filesRef = useRef(files);
  filesRef.current = files;
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const activeRef = useRef(active);
  activeRef.current = active;
  const readonlyRef = useRef<Set<string>>(new Set());

  // Closing the window inside the autosave delay must not lose the last keystrokes.
  useEffect(
    () =>
      onUnloadFlush(() => {
        if (savedRef.current) return;
        const body = new Blob([JSON.stringify({ files: filesRef.current })], { type: 'application/json' });
        navigator.sendBeacon(`/api/items/${itemKey}/save`, body);
      }),
    [itemKey],
  );

  useEffect(() => {
    api.item<TaskData>(itemKey).then((t) => {
      setTask(t);
      setFiles(t.files);
      setHints(t.hints);
      const focus = t.focus.filter((f) => f in t.files);
      const first = focus[0] ?? Object.keys(t.files).find((p) => !t.readonly.includes(p)) ?? Object.keys(t.files)[0];
      setOpenTabs(focus.length ? focus : [first]);
      setActive(first);
    });
  }, [itemKey]);

  // autosave
  useEffect(() => {
    if (!task || saved) return;
    const t = setTimeout(() => {
      api.save(itemKey, filesRef.current).then(() => setSaved(true));
    }, 900);
    return () => clearTimeout(t);
  }, [files, saved, task, itemKey]);

  const readonly = useMemo(() => new Set(task?.readonly ?? []), [task]);
  readonlyRef.current = readonly;

  useEffect(() => {
    if (!formatNote) return;
    const t = setTimeout(() => setFormatNote(null), formatNote.ok ? 1500 : 5000);
    return () => clearTimeout(t);
  }, [formatNote]);

  /** Prettier-format the open file (no-op for read-only or unsupported files). */
  const formatActive = useCallback(async (quiet = false) => {
    const path = activeRef.current;
    const view = cmRef.current?.view;
    if (!view || !path || readonlyRef.current.has(path) || !canFormat(path)) return;
    const r = await formatView(view, path);
    if (!r.ok) setFormatNote({ ok: false, text: `Couldn't format: ${r.error}` });
    else if (!quiet || r.changed) setFormatNote({ ok: true, text: r.changed ? 'formatted' : 'already formatted' });
  }, []);

  // Stable per file: a new array each render would make CodeMirror reconfigure (and reparse) constantly.
  const extensions = useMemo(() => editorExtensions(active, () => void formatActive()), [active, formatActive]);

  const saveNow = useCallback(async () => {
    await formatActive(true);
    const view = cmRef.current?.view;
    const path = activeRef.current;
    // Read the editor directly: state from the format's onChange hasn't re-rendered into filesRef yet.
    const files = view && path && !readonlyRef.current.has(path)
      ? { ...filesRef.current, [path]: view.state.doc.toString() }
      : filesRef.current;
    await api.save(itemKey, files);
    setSaved(true);
  }, [formatActive, itemKey]);
  const focus = useMemo(() => new Set(task?.focus ?? []), [task]);

  const openFile = (p: string) => {
    setOpenTabs((tabs) => (tabs.includes(p) ? tabs : [...tabs, p]));
    setActive(p);
  };
  const closeTab = (p: string) => {
    setOpenTabs((tabs) => {
      const next = tabs.filter((t) => t !== p);
      if (active === p) setActive(next[next.length - 1] ?? '');
      return next;
    });
  };

  const jumpTo = useCallback(
    (e: CompileError) => {
      if (!(e.file in filesRef.current)) return;
      openFile(e.file);
      setTimeout(() => {
        const view = cmRef.current?.view;
        if (!view || !e.line) return;
        const line = view.state.doc.line(Math.min(e.line, view.state.doc.lines));
        view.dispatch({
          selection: { anchor: line.from + Math.max(0, e.column) },
          effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
        });
        view.focus();
      }, 60);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const run = useCallback(async () => {
    if (!task || busy) return;
    setBusy('run');
    try {
      if (task.preview) {
        setBottomTab('preview');
        const r = await api.preview(itemKey, filesRef.current);
        if (r.ok) {
          setPreviewUrl(r.url);
          setPreviewErrors(null);
        } else setPreviewErrors(r.compileErrors ?? []);
      } else {
        setBottomTab('console');
        setRunOut(await api.run(itemKey, filesRef.current));
      }
      setSaved(true);
    } finally {
      setBusy(null);
    }
  }, [task, busy, itemKey]);

  const submit = useCallback(async () => {
    if (!task || busy) return;
    setBusy('submit');
    setBottomTab('tests');
    try {
      const out = await api.submit(itemKey, filesRef.current);
      setTestOut(out);
      setSaved(true);
      setTask((t) =>
        t
          ? {
              ...t,
              attempts: out.attempts ?? t.attempts,
              solutionAvailable: !!out.solutionAvailable,
              status: out.ok ? 'passed' : t.status,
            }
          : t,
      );
      if (out.firstPass) {
        setCelebrate(true);
        setMilestone(milestones[itemKey] ?? null);
      }
      if (out.ok) void refresh();
    } finally {
      setBusy(null);
    }
  }, [task, busy, itemKey, refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) void submit();
        else void run();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveNow();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, submit, saveNow]);

  if (!task) return null;
  const ctx = find(itemKey);
  const { next } = neighbors(itemKey);

  if (task.locked) {
    const prevStep = ctx?.mod;
    return (
      <div className="locked-screen card">
        <h2>🔒 Not yet</h2>
        {task.kind === 'forge' ? (
          <p>
            Forge steps build on each other — this one starts from the code you wrote in the previous forge step. Finish
            that first.
          </p>
        ) : (
          <p>This one runs on your finished Taskforge, so every forge step has to pass first.</p>
        )}
        <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>
          (Module {prevStep?.number}: {task.title})
        </p>
        <button
          className="btn"
          onClick={async () => {
            if (!confirm('Unlock every forge step? Missing earlier steps will use the reference solution as their starting point.'))
              return;
            await api.settings({ unlockAll: true });
            await refresh();
            setTask({ ...task, locked: false });
          }}
        >
          Unlock all steps anyway
        </button>
      </div>
    );
  }

  const fileList = Object.keys(files);
  const isRO = readonly.has(active);

  return (
    <div
      className="task"
      ref={taskRef}
      style={{ '--left-w': leftW ? `${leftW}px` : undefined } as React.CSSProperties}
    >
      {celebrate && <Celebrate onDone={() => setCelebrate(false)} />}
      {milestone && <Milestone milestone={milestone} next={next} onClose={closeMilestone} />}
      <section className="task-left">
        <div className="task-head">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={'badge ' + task.kind}>
              {task.kind === 'forge' ? '⚒' : task.kind === 'bughunt' ? '🐞' : '⚑'} {KIND_LABEL[task.kind as keyof typeof KIND_LABEL]}
            </span>
            {task.status === 'passed' && <span className="badge passed">✓ passed</span>}
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              Module {ctx?.mod.number} · {ctx?.mod.title}
            </span>
          </div>
          <h1>{task.title}</h1>
          {ctx && <p className="task-after">{afterThis(curriculum?.modules ?? [], ctx.mod, task.key)}</p>}
        </div>
        <div className="tabs">
          <button className={'tab' + (leftTab === 'brief' ? ' active' : '')} onClick={() => setLeftTab('brief')}>
            Brief
          </button>
          <button className={'tab' + (leftTab === 'hints' ? ' active' : '')} onClick={() => setLeftTab('hints')}>
            Hints{' '}
            <span className="count">
              {hints.length}/{task.hintCount}
            </span>
          </button>
          <button className={'tab' + (leftTab === 'solution' ? ' active' : '')} onClick={() => setLeftTab('solution')}>
            Solution {task.solutionAvailable ? '' : '🔒'}
          </button>
        </div>
        <div className="task-scroll">
          {leftTab === 'brief' && (
            <>
              <Markdown text={task.instructions} />
              {task.status === 'passed' && next && (
                <div className="callout tip" style={{ marginTop: 20 }}>
                  <div className="callout-title">Done</div>
                  <p>
                    Nice work.{' '}
                    <a href={`/learn/${next.key}`} onClick={onLinkClick}>
                      Next: {next.title} →
                    </a>
                  </p>
                </div>
              )}
            </>
          )}
          {leftTab === 'hints' && (
            <div>
              {task.needs.length > 0 && (
                <div className="callout note">
                  <div className="callout-title">Stuck?</div>
                  <p>
                    {task.needs.length > 1 ? 'These lessons cover it: ' : 'This lesson covers it: '}
                    {task.needs.map((lesson, i) => (
                      <span key={lesson.key}>
                        {i > 0 && ' and '}
                        <a href={`/learn/${lesson.key}`} onClick={onLinkClick}>
                          {lesson.title}
                        </a>
                      </span>
                    ))}
                    . Your code stays here while you read.
                  </p>
                </div>
              )}
              <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>
                Hints go from a gentle nudge to nearly-there. Take one at a time — struggling a little is where the
                learning happens.
              </p>
              {hints.map((h, i) => (
                <div className="hint-card" key={i}>
                  <div className="n">Hint {i + 1}</div>
                  <Markdown text={h} />
                </div>
              ))}
              {hints.length < task.hintCount ? (
                <button className="btn" onClick={async () => setHints((await api.hint(itemKey)).hints)}>
                  Show hint {hints.length + 1} of {task.hintCount}
                </button>
              ) : (
                <div className="empty">No more hints.</div>
              )}
            </div>
          )}
          {leftTab === 'solution' && (
            <div>
              {!task.solutionAvailable ? (
                <p style={{ color: 'var(--text-dim)' }}>
                  The reference solution unlocks after you pass, or after 3 submitted attempts ({task.attempts}/3 so far).
                  Try the hints first.
                </p>
              ) : !solution ? (
                <>
                  <p style={{ color: 'var(--text-dim)' }}>
                    {task.status === 'passed'
                      ? 'Compare your approach with the reference. Different is fine — tests passing means it works.'
                      : 'Looking now is OK — but try to rebuild it yourself afterwards without peeking.'}
                  </p>
                  <button className="btn" onClick={async () => setSolution((await api.solution(itemKey)).files)}>
                    Reveal solution
                  </button>
                </>
              ) : (
                Object.entries(solution).map(([p, c]) => (
                  <div className="solution-file" key={p}>
                    <CodeBlock code={c} title={p} lang={p.split('.').pop()} />
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </section>

      <Splitter
        axis="x"
        label="Resize brief and editor"
        onDrag={(x) => setLeftW(x - taskRef.current!.getBoundingClientRect().left)}
        onReset={() => setLeftW(null)}
      />

      <section
        className="task-right"
        ref={rightRef}
        style={{ '--bottom-h': bottomH ? `${bottomH}px` : undefined } as React.CSSProperties}
      >
        <div className="editor-bar">
          <button className="btn small" onClick={run} disabled={!!busy}>
            {busy === 'run' ? <span className="spinner" /> : '▶'} {task.preview ? 'Run preview' : 'Run playground'}
          </button>
          <button className="btn small primary" onClick={submit} disabled={!!busy}>
            {busy === 'submit' ? <span className="spinner" /> : '✓'} Submit
          </button>
          <span className="kbd-hint">Ctrl+Enter run · Ctrl+Shift+Enter submit · Ctrl+S format &amp; save</span>
          <div className="spacer" />
          {formatNote && (
            <span className={'kbd-hint format-note' + (formatNote.ok ? '' : ' bad')} title={formatNote.text}>
              {formatNote.text}
            </span>
          )}
          <span className="kbd-hint">{saved ? 'saved' : 'saving…'}</span>
          {!isRO && canFormat(active) && (
            <button className="btn small" title="Format with Prettier (Shift+Alt+F, or Ctrl+S)" onClick={() => void formatActive()}>
              ✨ Format
            </button>
          )}
          {!isRO && active && (
            <button
              className="btn small"
              title="Reset this file to how the step started"
              onClick={async () => {
                if (!confirm(`Reset ${active}? Your changes to this file will be lost.`)) return;
                const r = await api.reset(itemKey, active);
                setFiles((f) => ({ ...f, [r.path]: r.content }));
              }}
            >
              ↺ Reset file
            </button>
          )}
          {task.status === 'passed' && next && (
            <button className="btn small ok" onClick={() => navigate(`/learn/${next.key}`)}>
              Next →
            </button>
          )}
        </div>
        <div
          className="editor-area"
          ref={areaRef}
          style={{ '--tree-w': treeW ? `${treeW}px` : undefined } as React.CSSProperties}
        >
          <FileTree files={fileList} active={active} readonly={readonly} focus={focus} onOpen={openFile} />
          <Splitter
            axis="x"
            label="Resize file tree"
            onDrag={(x) => setTreeW(x - areaRef.current!.getBoundingClientRect().left)}
            onReset={() => setTreeW(null)}
          />
          <div className="editor-pane">
            <div className="file-tabs">
              {openTabs.map((p) => (
                <button key={p} className={'file-tab' + (p === active ? ' active' : '')} onClick={() => setActive(p)}>
                  {p}
                  <span
                    className="x"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(p);
                    }}
                  >
                    ×
                  </span>
                </button>
              ))}
            </div>
            <div className="cm-host">
              {isRO && <span className="ro-banner">read-only · provided</span>}
              {active && (
                <CodeMirror
                  key={active}
                  ref={cmRef}
                  value={files[active] ?? ''}
                  height="100%"
                  theme={dark ? oneDark : 'light'}
                  extensions={extensions}
                  editable={!isRO}
                  readOnly={isRO}
                  onChange={(v) => {
                    setFiles((f) => ({ ...f, [active]: v }));
                    setSaved(false);
                  }}
                  basicSetup={{ tabSize: 2 }}
                  indentWithTab={false}
                />
              )}
            </div>
          </div>
        </div>
        <Splitter
          axis="y"
          label="Resize output panel"
          onDrag={(y) => setBottomH(rightRef.current!.getBoundingClientRect().bottom - y)}
          onReset={() => setBottomH(null)}
        />
        <div className="bottom-panel">
          <div className="tabs">
            <button className={'tab' + (bottomTab === 'console' ? ' active' : '')} onClick={() => setBottomTab('console')}>
              Console
            </button>
            <button className={'tab' + (bottomTab === 'tests' ? ' active' : '')} onClick={() => setBottomTab('tests')}>
              Tests
              {testOut && testOut.results.length > 0 && (
                <span className="count" style={{ color: testOut.ok ? 'var(--ok)' : 'var(--bad)' }}>
                  {testOut.results.filter((r) => r.passed).length}/{testOut.results.length}
                </span>
              )}
            </button>
            {task.preview && (
              <button className={'tab' + (bottomTab === 'preview' ? ' active' : '')} onClick={() => setBottomTab('preview')}>
                Preview
              </button>
            )}
          </div>
          <div className="bottom-scroll" style={bottomTab === 'preview' ? { padding: 6 } : undefined}>
            {bottomTab === 'console' && <ConsolePanel out={runOut} onJump={jumpTo} />}
            {bottomTab === 'tests' && <TestsPanel out={testOut} onJump={jumpTo} />}
            {bottomTab === 'preview' &&
              (previewErrors ? (
                <CompileErrors errors={previewErrors} onJump={jumpTo} />
              ) : previewUrl ? (
                <iframe className="preview-frame" src={previewUrl} title="Preview" />
              ) : (
                <div className="empty">Press “Run preview” to build your components and render them against the live Taskforge API.</div>
              ))}
          </div>
        </div>
      </section>
    </div>
  );
}
