import { useEffect, useRef } from 'react';
import type { Milestone as MilestoneInfo } from '../../../shared/stages';
import type { ItemSummary } from '../api';
import { onLinkClick } from '../router';

/** The end of a stage. It shows on top of the task that got there, with the sparks from Celebrate. */
export function Milestone({
  milestone,
  next,
  onClose,
}: {
  milestone: MilestoneInfo;
  next?: ItemSummary;
  onClose: () => void;
}) {
  const primary = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="milestone-backdrop" onClick={onClose}>
      <div
        className="card milestone"
        role="dialog"
        aria-modal="true"
        aria-labelledby="milestone-title"
        onClick={(e) => e.stopPropagation()}
      >
        <img src="/forge.svg" alt="" />
        <h2 id="milestone-title">{milestone.title}</h2>
        <p>{milestone.body}</p>
        <div className="milestone-actions">
          <a ref={primary} className="btn primary" href={milestone.link.href} onClick={onLinkClick}>
            {milestone.link.label}
          </a>
          {next && (
            <a className="btn" href={`/learn/${next.key}`} onClick={onLinkClick}>
              Next: {next.title} →
            </a>
          )}
          <button className="btn" onClick={onClose}>
            Stay here
          </button>
        </div>
      </div>
    </div>
  );
}
