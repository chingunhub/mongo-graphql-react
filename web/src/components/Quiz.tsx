import { useState } from 'react';
import { useCurriculum } from '../App';
import { t } from '../i18n';
import { onLinkClick } from '../router';
import { InlineMd } from '../viz/InlineMd';

function parseQuestion(source: string) {
  const lines = source.trim().split('\n');
  const q = lines.find((l) => l.startsWith('Q:'))?.slice(2).trim() ?? '';
  const lesson = lines.find((l) => l.startsWith('L:'))?.slice(2).trim() ?? '';
  const options = lines
    .filter((l) => /^- \[[ x]\]/.test(l))
    .map((l) => ({ text: l.replace(/^- \[[ x]\]\s*/, ''), right: l.startsWith('- [x]') }));
  const explain = lines
    .filter((l) => l.startsWith('>'))
    .map((l) => l.replace(/^>\s?/, ''))
    .join(' ');
  return { q, lesson, options, explain };
}

/**
 * ```quiz
 * Q: Question text?
 * - [ ] wrong option
 * - [x] right option
 * > Explanation shown after answering.
 * ```
 *
 * With `onAnswer` it takes one answer and the caller decides what comes next.
 */
export function Quiz({ source, onAnswer }: { source: string; onAnswer?: (right: boolean) => void }) {
  const { q, options, explain } = parseQuestion(source);
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  return (
    <div className="quiz">
      <div className="quiz-q">
        <span style={{ color: 'var(--forge)', marginRight: 6 }}>{t('quiz.check')}</span>
        <InlineMd text={q} />
      </div>
      <div className="quiz-opts">
        {options.map((o, i) => (
          <button
            key={i}
            disabled={answered}
            className={'quiz-opt' + (answered && o.right ? ' right' : '') + (picked === i && !o.right ? ' wrong' : '')}
            onClick={() => {
              setPicked(i);
              onAnswer?.(o.right);
            }}
          >
            <InlineMd text={o.text} />
          </button>
        ))}
      </div>
      {answered && (
        <div className="quiz-explain">
          <b style={{ color: options[picked].right ? 'var(--ok)' : 'var(--bad)' }}>
            {options[picked].right ? t('quiz.right') : t('quiz.wrong')}
          </b>
          <InlineMd text={explain} />{' '}
          {!onAnswer && (
            <button className="btn small" style={{ marginLeft: 6 }} onClick={() => setPicked(null)}>
              {t('quiz.retry')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Two wrong in ten still counts as ready. */
const READY_SHARE = 0.8;

/**
 * Mixed questions separated by `---`, each naming its lesson on an `L:` line. It never locks anything:
 * the result only says whether to move on or which lessons to reread.
 *
 * ```checkpoint
 * Q: Question text?
 * L: m03/l1-queries
 * - [x] right option
 * - [ ] wrong option
 * > Explanation shown after answering.
 * ```
 */
export function Checkpoint({ source }: { source: string }) {
  const { data } = useCurriculum();
  const questions = source.split(/^---$/m).map(parseQuestion);
  const [picked, setPicked] = useState<(number | null)[]>(() => questions.map(() => null));
  const titleOf = (key: string) =>
    data?.modules.flatMap((m) => m.items).find((i) => i.key === key)?.title ?? key;
  const lessonLink = (key: string) => (
    <a href={`/learn/${key}`} onClick={onLinkClick}>
      {titleOf(key)}
    </a>
  );

  const finished = picked.every((p) => p !== null);
  const missed = questions.filter((question, i) => picked[i] !== null && !question.options[picked[i]!].right);
  const missCount = (key: string) => missed.filter((question) => question.lesson === key).length;
  const lessons = [...new Set(missed.map((question) => question.lesson))]
    .sort((a, b) => missCount(b) - missCount(a))
    .slice(0, 2);
  const ready = questions.length - missed.length >= questions.length * READY_SHARE;

  return (
    <div className="checkpoint">
      {questions.map((question, i) => {
        const answer = picked[i];
        const answered = answer !== null;
        return (
          <div className="quiz" key={i}>
            <div className="quiz-q">
              <span style={{ color: 'var(--forge)', marginRight: 6 }}>
                {i + 1} of {questions.length} ·
              </span>
              <InlineMd text={question.q} />
            </div>
            <div className="quiz-opts">
              {question.options.map((o, n) => (
                <button
                  key={n}
                  disabled={answered}
                  className={
                    'quiz-opt' + (answered && o.right ? ' right' : '') + (answer === n && !o.right ? ' wrong' : '')
                  }
                  onClick={() => setPicked(picked.map((p, at) => (at === i ? n : p)))}
                >
                  <InlineMd text={o.text} />
                </button>
              ))}
            </div>
            {answered && (
              <div className="quiz-explain">
                <b style={{ color: question.options[answer].right ? 'var(--ok)' : 'var(--bad)' }}>
                  {question.options[answer].right ? t('quiz.right') : t('quiz.wrong')}
                </b>
                <InlineMd text={question.explain} /> From {lessonLink(question.lesson)}.
              </div>
            )}
          </div>
        );
      })}
      {finished && (
        <div className={'callout ' + (ready ? 'tip' : 'note')} role="status">
          <div className="callout-title">
            {questions.length - missed.length} of {questions.length}
          </div>
          {ready ? (
            <p>
              <b>You're ready.</b>{' '}
              {lessons.length > 0 && (
                <>
                  If you have ten minutes, reread {lessonLink(lessons[0])}
                  {lessons[1] && <> and {lessonLink(lessons[1])}</>}.{' '}
                </>
              )}
              Carry on to the next part.
            </p>
          ) : (
            <p>
              <b>Go back to {lessons.length > 1 ? 'these two lessons' : 'this lesson'} first:</b>{' '}
              {lessonLink(lessons[0])}
              {lessons[1] && <> and {lessonLink(lessons[1])}</>}. Nothing is locked, so you can also carry on and
              come back. Either way, it's easier to fix this now than three modules from now.
            </p>
          )}
          <button className="btn small" onClick={() => setPicked(questions.map(() => null))}>
            Try it again
          </button>
        </div>
      )}
    </div>
  );
}
