// Preview (provided): your thread on TF-5 ("Login page") of the live reference API, logged in as Ada.
import { createRoot } from 'react-dom/client';
import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { SetContextLink } from '@apollo/client/link/context';
import { ApolloProvider } from '@apollo/client/react';
import { CommentThread } from './CommentThread';

async function gql(query: string, variables?: object, token?: string) {
  const res = await fetch('/reference/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  return (await res.json()).data;
}

const login = await gql('mutation { login(email: "ada@taskforge.dev", password: "password123") { token user { id name } } }');
const token = login?.login?.token;
const issues = await gql('{ project(key: "TF") { issues(limit: 50, sort: OLDEST) { id key } } }');
const issueId = issues?.project?.issues?.find((i: { key: string }) => i.key === 'TF-5')?.id;

const client = new ApolloClient({
  link: new SetContextLink((prev) => ({ headers: { ...prev.headers, authorization: `Bearer ${token}` } })).concat(
    new HttpLink({ uri: '/reference/graphql' }),
  ),
  cache: new InMemoryCache(),
});

createRoot(document.getElementById('root')!).render(
  <ApolloProvider client={client}>
    <CommentThread issueId={issueId} currentUser={login.login.user} />
  </ApolloProvider>,
);
