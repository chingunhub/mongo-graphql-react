import { useEffect, useState } from 'react';
import { api, type ReviewCard, type ReviewSession } from '../api';
import { t } from '../i18n';
import { onLinkClick } from '../router';
import { Quiz } from './Quiz';

const WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five'];

function count(cards: ReviewCard[]) {
  return cards.length === 1
    ? t('review.one')
    : t('review.many', { word: WORDS[cards.length], count: cards.length });
}

/** A skippable set of old questions at the start of a session. It decides nothing about progress. */
export function ReviewWarmup() {
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<boolean | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    api.review().then(setSession, () => setClosed(true));
  }, []);

  if (closed || !session || session.cards.length === 0) return null;
  const { cards, gapDays } = session;
  const card = cards[index];

  const rest = () => {
    setClosed(true);
    api.restReview().catch(() => {});
  };
  const next = () => {
    if (index + 1 === cards.length) return rest();
    setIndex(index + 1);
    setResult(null);
  };

  if (!started) {
    return (
      <section className="card review-warmup" aria-label="Review warm-up">
        <span className="num">{t('review.label')}</span>
        <h3>{gapDays >= 7 ? t('review.welcome', { days: gapDays }) : t('review.title')}</h3>
        <p>
          {t('review.intro', { count: count(cards), minutes: cards.length * 2 })}{' '}
          {gapDays >= 7 ? t('review.whyBack') : t('review.why')}
        </p>
        <div className="review-actions">
          <button className="btn primary" onClick={() => setStarted(true)}>
            {t('review.start')}
          </button>
          <button className="btn" onClick={rest}>
            {t('review.notToday')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card review-warmup" aria-label="Review warm-up">
      <span className="num">{t('review.progress', { index: index + 1, total: cards.length })}</span>
      {card.kind === 'quiz' ? (
        <>
          <Quiz
            key={card.id}
            source={card.source}
            onAnswer={(right) => {
              setResult(right);
              api.answerReview(card.id, right ? 'right' : 'wrong').catch(() => {});
            }}
          />
          {result === false && (
            <p>
              {t('review.reread')}{' '}
              <a href={`/learn/${card.lesson.key}`} onClick={onLinkClick}>
                {card.lesson.title}
              </a>
              {t('review.rereadEnd')}
            </p>
          )}
        </>
      ) : (
        <>
          <h3>{t('review.drillTitle')}</h3>
          <p>
            <b>{card.title}.</b> {card.summary} {t('review.drillBody')}
          </p>
        </>
      )}
      <div className="review-actions">
        {card.kind === 'drill' ? (
          <a
            className="btn primary"
            href={`/learn/${card.key}`}
            onClick={(e) => {
              api.answerReview(card.id, 'right').catch(() => {});
              rest();
              onLinkClick(e);
            }}
          >
            {t('review.openDrill')}
          </a>
        ) : (
          result !== null && (
            <button className="btn primary" onClick={next}>
              {t(index + 1 === cards.length ? 'review.done' : 'review.next')}
            </button>
          )
        )}
        {result === null && (
          <button
            className="btn"
            onClick={() => {
              api.answerReview(card.id, 'skip').catch(() => {});
              next();
            }}
          >
            {t('review.skip')}
          </button>
        )}
      </div>
    </section>
  );
}
