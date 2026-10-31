import { useEffect, useState } from 'react';
import { partColor, useCurriculum } from '../App';
import { api, type ItemSummary, type ModuleSummary } from '../api';
import { currentLanguage, t } from '../i18n';
import { onLinkClick } from '../router';
import { allowUnload } from '../unloadGuard';
import { languages, type Language } from '../../../shared/languages';
import { isDone, stageProgress } from './moduleProgress';

export { isDone };

export function KindIcon({ item }: { item: ItemSummary }) {
  if (isDone(item)) return <span className="kind-icon done">✓</span>;
  if (item.locked) return <span className="kind-icon drill">🔒</span>;
  const glyph = { lesson: '◇', drill: '⚑', forge: '⚒', bughunt: '🐞' }[item.kind];
  return <span className={'kind-icon ' + item.kind}>{glyph}</span>;
}

export function Ring({ value, color, size = 18 }: { value: number; color: string; size?: number }) {
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="2.5" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray={`${c * value} ${c}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function ModuleBlock({ mod, path }: { mod: ModuleSummary; path: string }) {
  const containsActive = path.startsWith(`/learn/${mod.id}/`);
  const [open, setOpen] = useState(containsActive);
  useEffect(() => {
    if (containsActive) setOpen(true);
  }, [containsActive]);
  const done = mod.items.filter(isDone).length;
  const color = partColor(mod.part);
  return (
    <div className="mod" style={{ '--part-color': color } as React.CSSProperties}>
      <button className="mod-head" onClick={() => setOpen((o) => !o)}>
        <span className="mod-num">{String(mod.number).padStart(2, '0')}</span>
        <span className="mod-title">{mod.title}</span>
        <Ring value={mod.items.length ? done / mod.items.length : 0} color={color} />
      </button>
      {open && (
        <ul className="mod-items">
          {mod.items.map((item) => {
            const href = `/learn/${item.key}`;
            return (
              <li key={item.key}>
                <a
                  href={href}
                  onClick={onLinkClick}
                  className={(path === href ? 'active ' : '') + (item.locked ? 'locked' : '')}
                >
                  <KindIcon item={item} />
                  <span className="item-title">{item.title}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function groupByPart(modules: ModuleSummary[]) {
  const parts: { part: string; mods: ModuleSummary[] }[] = [];
  for (const m of modules) {
    const last = parts[parts.length - 1];
    if (last?.part === m.part) last.mods.push(m);
    else parts.push({ part: m.part, mods: [m] });
  }
  return parts;
}

function LanguagePicker() {
  const choose = async (id: Language) => {
    await api.settings({ language: id });
    // A task's unsaved edits are flushed on the way out, so reloading is safe anywhere.
    allowUnload();
    location.reload();
  };
  return (
    <div className="language-picker" role="group" aria-label="Language">
      {languages.map(({ id, name }) => (
        <button
          key={id}
          className={'btn small' + (id === currentLanguage() ? ' primary' : '')}
          aria-pressed={id === currentLanguage()}
          lang={id}
          onClick={() => void choose(id)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

export function Sidebar({ path }: { path: string }) {
  const { data } = useCurriculum();
  if (!data) return <nav className="sidebar" />;
  return (
    <nav className="sidebar">
      <LanguagePicker />
      {stageProgress(data.modules).map(({ stage, done, total }) => (
        <section key={stage.number} className="stage-group">
          <div className="stage-label">
            <span>{t('stage.label', { number: stage.number, name: t(`stage.${stage.number}`) })}</span>
            <span className="stage-count">
              {done === total ? '✓ ' : ''}
              {done}/{total}
            </span>
          </div>
          {groupByPart(data.modules.filter((m) => m.stage === stage.number)).map(({ part, mods }) => (
            <div key={part} style={{ '--part-color': partColor(part) } as React.CSSProperties}>
              <div className="part-label">{part}</div>
              {mods.map((m) => (
                <ModuleBlock key={m.id} mod={m} path={path} />
              ))}
            </div>
          ))}
        </section>
      ))}
    </nav>
  );
}
