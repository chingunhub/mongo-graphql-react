import { useState } from 'react';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';

const CREATE_ISSUE = gql`
  mutation CreateIssue($input: CreateIssueInput!) {
    createIssue(input: $input) {
      id
      key
      title
      status
    }
  }
`;

export function NewIssueForm({ projectId }: { projectId: string }) {
  const [title, setTitle] = useState('');
  const [createIssue, { loading }] = useMutation(CREATE_ISSUE, {
    // must match `query ProjectIssues` exactly
    refetchQueries: ['ProjectIssues'],
  });

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await createIssue({ variables: { input: { projectId, title } } });
        setTitle('');
      }}
    >
      <label>
        New issue
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <button disabled={loading || title.trim().length < 3}>Add</button>
    </form>
  );
}
