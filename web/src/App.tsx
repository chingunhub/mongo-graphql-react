import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, type CurriculumData, type ItemSummary, type ModuleSummary } from './api';
import { usePath, onLinkClick } from './router';
import { Sidebar } from './components/Sidebar';
import { Home } from './components/Home';
import { LessonView } from './components/LessonView';
import { TaskView } from './components/TaskView';
import { TaskforgePage } from './components/TaskforgePage';
import { RelaydeskPage } from './components/RelaydeskPage';
import { UpdateNotice } from './components/UpdateNotice';
import { stageProgress } from './components/moduleProgress';
import { useReferenceStatus } from './components/useReference';
import { allowUnload } from './unloadGuard';
import { setLanguage } from './i18n';
import { Splitter, usePaneSize } from './components/Splitter';

interface Ctx {
  data: CurriculumData | null;
  refresh: () => Promise<void>;
  find: (key: string) => { mod: ModuleSummary; item: ItemSummary; index: number } | null;
  neighbors: (key: string) => { prev?: ItemSummary; next?: ItemSummary };
}
const CurriculumContext = createContext<Ctx>(null!);
export const useCurriculum = () => useContext(CurriculumContext);

export function partColor(part: string) {
  if (/mongo/i.test(part)) return 'var(--mongo)';
  if (/client|react/i.test(part)) return 'var(--react)';
  if (/graphql|server/i.test(part)) return 'var(--gql)';
  return 'var(--forge)';
}

function useTheme() {
  const [theme, setTheme] = useState<string>(() => {
    try {
      return localStorage.getItem('forge-theme') ?? 'auto';
    } catch {
      return 'auto';
    }
  });
  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('forge-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  const next = () => setTheme((t) => (t === 'auto' ? 'dark' : t === 'dark' ? 'light' : 'auto'));
  return { theme, next };
}

export function App() {
  const [data, setData] = useState<CurriculumData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const path = usePath();
  const onTask = /^\/learn\/m\d\d\/(?!l\d)/.test(path);
  const [collapsedPref, setCollapsed] = useState<boolean | null>(null);
  // Tasks need the width: collapse the curriculum there unless the user opened it.
  const collapsed = collapsedPref ?? onTask;
  useEffect(() => setCollapsed(null), [onTask]);
  const { theme, next: nextTheme } = useTheme();
  const [sidebarW, setSidebarW] = usePaneSize('sidebar', { min: 200, max: 520 });
  const ref = useReferenceStatus();

  const refresh = useCallback(async () => {
    try {
      const next = await api.curriculum();
      setLanguage(next.settings.language ?? 'en');
      setData(next);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ctx = useMemo<Ctx>(() => {
    const flat: { mod: ModuleSummary; item: ItemSummary }[] = [];
    for (const mod of data?.modules ?? []) for (const item of mod.items) flat.push({ mod, item });
    return {
      data,
      refresh,
      find: (key) => {
        const index = flat.findIndex((f) => f.item.key === key);
        return index === -1 ? null : { ...flat[index], index };
      },
      neighbors: (key) => {
        const i = flat.findIndex((f) => f.item.key === key);
        return { prev: flat[i - 1]?.item, next: flat[i + 1]?.item };
      },
    };
  }, [data, refresh]);

  // Students work toward the stage they're in, not a share of the whole course.
  const progress = stageProgress(data?.modules ?? []);
  const { stage, done, total } = progress.find((p) => p.done < p.total) ?? progress[progress.length - 1];

  let page: React.ReactNode = null;
  const m = path.match(/^\/learn\/(m\d\d)\/([^/]+)/);
  if (path === '/' || path === '') page = <Home />;
  else if (path.startsWith('/taskforge')) page = <TaskforgePage />;
  else if (path.startsWith('/relaydesk')) page = <RelaydeskPage />;
  else if (m) {
    const key = `${m[1]}/${m[2]}`;
    const found = ctx.find(key);
    if (!data) page = null;
    else if (!found) page = <div className="locked-screen">Not found.</div>;
    else if (found.item.kind === 'lesson') page = <LessonView key={key} itemKey={key} />;
    else page = <TaskView key={key} itemKey={key} />;
  }

  return (
    <CurriculumContext.Provider value={ctx}>
      <div
        className={'shell' + (collapsed ? ' collapsed' : '') + (collapsedPref === false ? ' mobile-open' : '')}
        style={{ '--sidebar-w': sidebarW ? `${sidebarW}px` : undefined } as React.CSSProperties}
      >
        <header className="topbar">
          <button
            className="icon-btn"
            title="Toggle sidebar"
            onClick={() =>
              setCollapsed(window.matchMedia('(max-width: 900px)').matches ? collapsedPref === false : !collapsed)
            }
          >
            ☰
          </button>
          <a href="/" className="brand" onClick={onLinkClick}>
            <img src="/forge.svg" alt="" />
            Forge Academy
          </a>
          <div className="spacer" />
          <UpdateNotice />
          <a href="/taskforge" className="icon-btn" onClick={onLinkClick} title="Your capstone project">
            ⚒ Taskforge
          </a>
          <a href="/relaydesk" className="icon-btn" onClick={onLinkClick} title="Your connected systems project">
            Relaydesk
          </a>
          <details className="menu">
            <summary className="icon-btn" title={`Reference API (used by live examples): ${ref.status}`}>
              <span className={'status-dot ' + ref.status} /> API
            </summary>
            <div className="menu-pop card">
              <p>
                The reference Taskforge API powers live examples and previews. Status: <b>{ref.status}</b>.
              </p>
              <button
                className="btn small"
                onClick={async () => {
                  await api.restartReference();
                  allowUnload();
                  location.reload();
                }}
              >
                ↺ Reset demo data
              </button>
              <button
                className="btn small"
                onClick={async () => {
                  if (
                    !confirm(
                      'Stop the Forge Academy server? Your progress is saved. Open the app again from the desktop shortcut.',
                    )
                  )
                    return;
                  await fetch('/api/shutdown', { method: 'POST' });
                  document.body.innerHTML =
                    '<p style="font-family:system-ui;padding:40px">Forge Academy server stopped. You can close this window.</p>';
                }}
              >
                ⏻ Quit server
              </button>
            </div>
          </details>
          {data && (
            <div className="progress-pill" title={`Stage ${stage.number}, ${stage.name}: ${done} of ${total} items done`}>
              Stage {stage.number}
              <div className="progress-bar">
                <div style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
              </div>
              {done}/{total}
            </div>
          )}
          <button className="icon-btn" onClick={nextTheme} title="Theme: auto → dark → light">
            {theme === 'auto' ? '◐' : theme === 'dark' ? '☾' : '☀'}
          </button>
        </header>
        <Sidebar path={path} />
        <Splitter
          className="sidebar-splitter"
          axis="x"
          label="Resize sidebar"
          onDrag={(x) => setSidebarW(x)}
          onReset={() => setSidebarW(null)}
        />
        <main className="main">
          {error && (
            <div className="locked-screen">
              <h2>Can't reach the Forge server</h2>
              <p>{error}</p>
            </div>
          )}
          {page}
        </main>
      </div>
    </CurriculumContext.Provider>
  );
}
