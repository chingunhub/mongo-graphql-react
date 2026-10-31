import { gql } from '@apollo/client';
import { StatusSelect } from './StatusSelect';

// Everything the card renders — and nothing else. Pages spread this; only this file changes when the card does.
export const ISSUE_CARD_FIELDS = gql`
  fragment IssueCardFields on Issue {
    id
    key
    title
    status
    priority
    commentCount
    labels {
      name
      color
    }
    assignee {
      id
      name
    }
  }
`;

export interface IssueCardData {
  id: string;
  key: string;
  title: string;
  status: string;
  priority: string;
  commentCount: number;
  labels: { name: string; color: string }[];
  assignee: { id: string; name: string } | null;
}

export function IssueCard({ issue }: { issue: IssueCardData }) {
  return (
    <article aria-label={issue.key}>
      <div>
        <strong>{issue.key}</strong> · <small>{issue.priority}</small>
      </div>
      <div>{issue.title}</div>
      <div>
        {issue.labels.map((l) => (
          <span key={l.name} style={{ color: l.color, marginRight: 6 }}>
            #{l.name}
          </span>
        ))}
      </div>
      <small>
        {issue.assignee?.name ?? 'Unassigned'}
        {issue.commentCount > 0 && ` · ${issue.commentCount} comments`}
      </small>
      <StatusSelect issue={issue} />
    </article>
  );
}
