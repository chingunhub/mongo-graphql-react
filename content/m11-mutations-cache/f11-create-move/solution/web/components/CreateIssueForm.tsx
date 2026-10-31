import { useState } from 'react';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export const CREATE_ISSUE = gql`
  mutation CreateIssue($input: CreateIssueInput!) {
    createIssue(input: $input) {
      id
      key
      title
      status
      priority
      assignee {
        id
        name
      }
    }
  }
`;

export function CreateIssueForm({ projectId }: { projectId: string }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [invalid, setInvalid] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [createIssue, { loading, error }] = useMutation<any>(CREATE_ISSUE, {
    // Which filtered lists should the new issue appear in? Let the server decide.
    refetchQueries: ['ProjectIssues'],
    awaitRefetchQueries: true,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setCreatedKey(null);
    const clean = title.trim();
    if (clean.length < 3) {
      setInvalid('Title must be at least 3 characters');
      return;
    }
    setInvalid(null);
    try {
      const { data } = await createIssue({ variables: { input: { projectId, title: clean, priority } } });
      setTitle('');
      setPriority('MEDIUM');
      setCreatedKey(data?.createIssue?.key ?? null);
    } catch {
      /* rendered via `error` */
    }
  }

  return (
    <form onSubmit={submit} aria-label="Create issue">
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Priority
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={loading}>
        {loading ? 'Creating…' : 'Create issue'}
      </button>
      {invalid && <p role="alert">{invalid}</p>}
      {error && <p role="alert">Couldn't create issue: {error.message}</p>}
      {createdKey && <p role="status">Created {createdKey}</p>}
    </form>
  );
}
