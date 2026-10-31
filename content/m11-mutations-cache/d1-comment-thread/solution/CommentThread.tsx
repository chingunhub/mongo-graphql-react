import { useState } from 'react';
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';

const ISSUE_COMMENTS = gql`
  query IssueComments($id: ID!) {
    issue(id: $id) {
      id
      commentCount
      comments {
        id
        body
        author {
          id
          name
        }
      }
    }
  }
`;

const ADD_COMMENT = gql`
  mutation AddComment($issueId: ID!, $body: String!) {
    addComment(issueId: $issueId, body: $body) {
      id
      body
      author {
        id
        name
      }
    }
  }
`;

interface CommentRow {
  id: string;
  body: string;
  author: { id: string; name: string };
}

export function CommentThread({ issueId, currentUser }: { issueId: string; currentUser: { id: string; name: string } }) {
  const [text, setText] = useState('');
  const { data, loading, error } = useQuery<any>(ISSUE_COMMENTS, { variables: { id: issueId } });
  const [addComment, { error: postError }] = useMutation<any>(ADD_COMMENT, {
    // Runs twice: once for the optimistic layer, once for the real result.
    update(cache, { data: result }) {
      const comment = result?.addComment;
      if (!comment) return;
      cache.modify({
        id: cache.identify({ __typename: 'Issue', id: issueId }),
        fields: {
          comments: (refs: readonly any[] = [], { toReference }) => [...refs, toReference(comment)!],
          commentCount: (n: number = 0) => n + 1,
        },
      });
    },
  });

  async function post(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    try {
      await addComment({
        variables: { issueId, body },
        optimisticResponse: {
          addComment: {
            __typename: 'Comment',
            id: `temp-${Date.now()}`,
            body,
            author: { __typename: 'User', id: currentUser.id, name: currentUser.name },
          },
        },
      });
      setText(''); // only after success — keep the text for a retry otherwise
    } catch {
      /* rendered via postError */
    }
  }

  if (loading) return <p>Loading comments…</p>;
  if (error) return <p role="alert">Couldn't load comments: {error.message}</p>;
  const issue = data?.issue;
  if (!issue) return <p>Issue not found.</p>;

  return (
    <section>
      <h3>{issue.commentCount} comments</h3>
      <ul>
        {issue.comments.map((c: CommentRow) => (
          <li key={c.id}>
            {c.author.name}: {c.body}
            {c.id.startsWith('temp-') && <em> Sending…</em>}
          </li>
        ))}
      </ul>
      <form onSubmit={post}>
        <label>
          Comment
          <textarea value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="submit" disabled={!text.trim()}>
          Post
        </button>
      </form>
      {postError && <p role="alert">Couldn't post comment: {postError.message}</p>}
    </section>
  );
}
