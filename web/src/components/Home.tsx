import { partColor, useCurriculum } from '../App';
import { t } from '../i18n';
import { onLinkClick } from '../router';
import { isDone } from './Sidebar';
import { stageProgress } from './moduleProgress';
import { StackMap } from '../viz/StackMap';
import { ForgeMap } from './ForgeMap';
import { ReviewWarmup } from './ReviewWarmup';

export function Home() {
  const { data } = useCurriculum();
  if (!data) return null;
  const all = data.modules.flatMap((m) => m.items);
  const nextItem = all.find((i) => !isDone(i) && !i.locked);
  const started = all.some(isDone);
  const resume = data.lastVisited && all.find((i) => i.key === data.lastVisited);

  return (
    <div className="home">
      <nav className="project-switch" aria-label="Project chapters">
        <a href="/" aria-current="page" onClick={onLinkClick}>
          {t('home.taskforge')}
        </a>
        <a href="/relaydesk" onClick={onLinkClick}>
          {t('home.relaydesk')}
        </a>
      </nav>
      <section className="hero">
        <h1>
          {t('home.heroLead')} <span style={{ color: 'var(--forge)' }}>{t('home.heroQuote')}</span> {t('home.heroTail')}
        </h1>
        <p>
          {t('home.intro')} <b>Taskforge</b>
          {t('home.introEnd')}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {nextItem && (
            <a className="btn primary" href={`/learn/${nextItem.key}`} onClick={onLinkClick}>
              {t(started ? 'home.continue' : 'home.start', { title: nextItem.title })}
            </a>
          )}
          {resume && resume.key !== nextItem?.key && (
            <a className="btn" href={`/learn/${resume.key}`} onClick={onLinkClick}>
              {t('home.back', { title: resume.title })}
            </a>
          )}
        </div>
      </section>

      <ReviewWarmup />

      <h2 className="section-title">{t('home.stages')}</h2>
      <p className="section-sub">{t('home.stagesNote')}</p>
      <div className="stage-grid">
        {stageProgress(data.modules).map(({ stage, done, total, open }) => (
          <a
            key={stage.number}
            className={'card stage-card' + (done === total ? ' finished' : '')}
            href={open ? `/learn/${open.key}` : '#'}
            onClick={onLinkClick}
          >
            <span className="num">
              {t('stage.card', { number: stage.number, goal: t(`stage.${stage.number}.goal`) })}
            </span>
            <h3>{t(`stage.${stage.number}`)}</h3>
            <p>{t(`stage.${stage.number}.intro`)}</p>
            {done === total ? (
              <span className="meter finished">{t('home.finished')}</span>
            ) : (
              <>
                <span className="progress-bar stage-bar">
                  <span style={{ width: `${(done / total) * 100}%` }} />
                </span>
                <span className="meter">{t('home.done', { done, total })}</span>
              </>
            )}
          </a>
        ))}
      </div>

      <h2 className="section-title">{t('home.build')}</h2>
      <p className="section-sub">{t('home.buildNote')}</p>
      <div className="card">
        <ForgeMap />
      </div>
      <p className="section-sub">
        <a href="/taskforge" onClick={onLinkClick}>
          {t('home.openProject')}
        </a>
      </p>

      <a className="card relaydesk-step" href="/relaydesk" onClick={onLinkClick} style={{ marginTop: 20 }}>
        <span>↗</span>
        <div>
          <strong>{t('home.afterTitle')}</strong>
          <p>{t('home.afterBody')}</p>
        </div>
      </a>

      <h2 className="section-title">{t('home.stack')}</h2>
      <p className="section-sub">{t('home.stackNote')}</p>
      <StackMap />

      <h2 className="section-title">{t('home.modules')}</h2>
      <div className="module-grid">
        {data.modules.map((m) => {
          const done = m.items.filter(isDone).length;
          const first = m.items.find((i) => !isDone(i)) ?? m.items[0];
          return (
            <a
              key={m.id}
              className="card module-card"
              href={first ? `/learn/${first.key}` : '#'}
              onClick={onLinkClick}
              style={{ '--part-color': partColor(m.part) } as React.CSSProperties}
            >
              <span className="num">
                {String(m.number).padStart(2, '0')} · {m.part}
              </span>
              <h3>{m.title}</h3>
              <p>{m.summary}</p>
              <span className="meter">{t('home.done', { done, total: m.items.length })}</span>
            </a>
          );
        })}
      </div>

      <div className="progress-export">
        <a className="btn" href="/api/progress/export" download>
          {t('progress.export')}
        </a>
        <p className="section-sub">{t('progress.exportNote')}</p>
      </div>
    </div>
  );
}
