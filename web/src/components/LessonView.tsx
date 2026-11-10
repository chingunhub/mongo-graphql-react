import { useEffect, useRef, useState } from 'react';
import { api, type LessonData } from '../api';
import { useCurriculum } from '../App';
import { t } from '../i18n';
import { Markdown } from './Markdown';
import { navigate, onLinkClick } from '../router';

export function LessonView({ itemKey }: { itemKey: string }) {
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const { find, neighbors, refresh } = useCurriculum();
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    api.item<LessonData>(itemKey).then(setLesson);
    top.current?.closest('.main')?.scrollTo(0, 0);
  }, [itemKey]);
  const ctx = find(itemKey);
  const { prev, next } = neighbors(itemKey);

  async function finish() {
    await api.completeLesson(itemKey);
    await refresh();
    if (next) navigate(`/learn/${next.key}`);
  }

  return (
    <article className="lesson-page" ref={top}>
      <div className="crumbs">
        {t('lesson.crumb', { number: ctx?.mod.number ?? '', title: ctx?.mod.title ?? '' })}
      </div>
      {lesson && (
        <>
          <h1>{lesson.title}</h1>
          <div className="lesson-meta">
            {t('lesson.meta', { minutes: lesson.minutes ?? 10 })}
            {lesson.done ? t('lesson.completed') : ''}
          </div>
          <Markdown authored text={lesson.body} />
          <div className="lesson-footer">
            {prev ? (
              <a className="btn" href={`/learn/${prev.key}`} onClick={onLinkClick}>
                ← {prev.title}
              </a>
            ) : (
              <span />
            )}
            <button className="btn primary" onClick={finish}>
              {next ? t('lesson.next', { title: next.title }) : t('lesson.finish')}
            </button>
          </div>
        </>
      )}
    </article>
  );
}
