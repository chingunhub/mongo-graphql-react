import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
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
    dueDate
    isOverdue
    pinned
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
  dueDate: string | null;
  isOverdue: boolean;
  pinned: boolean;
  labels: { name: string; color: string }[];
  assignee: { id: string; name: string } | null;
}

const SET_ISSUE_PINNED = gql`
  mutation SetIssuePinned($id: ID!, $pinned: Boolean!) {
    setIssuePinned(id: $id, pinned: $pinned) {
      id
      pinned
    }
  }
`;

function PinButton({ issue }: { issue: IssueCardData }) {
  // The response carries id + pinned, so the normalized cache updates every card by itself.
  const [setPinned, { error }] = useMutation(SET_ISSUE_PINNED);
  return (
    <>
      <button
        aria-label={`${issue.pinned ? 'Unpin' : 'Pin'} ${issue.key}`}
        onClick={() => setPinned({ variables: { id: issue.id, pinned: !issue.pinned } }).catch(() => {})}
      >
        {issue.pinned ? 'Unpin' : 'Pin'}
      </button>
      {error && <small role="alert">{error.message}</small>}
    </>
  );
}

export function IssueCard({ issue }: { issue: IssueCardData }) {
  return (
    <article aria-label={issue.key}>
      <div>
        <strong>{issue.key}</strong> · <small>{issue.priority}</small>
        {issue.pinned && <small> · Pinned</small>}
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
      {issue.dueDate && (
        <small>
          Due {issue.dueDate}
          {issue.isOverdue && <strong style={{ color: '#dc2626' }}> · Overdue</strong>}
        </small>
      )}
      <StatusSelect issue={issue} />
      <PinButton issue={issue} />
    </article>
  );
}
