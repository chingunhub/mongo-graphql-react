// Preview (provided): the board against the live reference API (project DOCS), logged in as Ada.
import { createRoot } from 'react-dom/client';
import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { SetContextLink } from '@apollo/client/link/context';
import { ApolloProvider } from '@apollo/client/react';
import { IssueBoard } from './IssueBoard';

const res = await fetch('/reference/graphql', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query: 'mutation { login(email: "ada@taskforge.dev", password: "password123") { token } }' }),
});
const token = (await res.json()).data?.login?.token;

const client = new ApolloClient({
  link: new SetContextLink((prev) => ({ headers: { ...prev.headers, authorization: `Bearer ${token}` } })).concat(
    new HttpLink({ uri: '/reference/graphql' }),
  ),
  cache: new InMemoryCache(),
});

createRoot(document.getElementById('root')!).render(
  <ApolloProvider client={client}>
    <IssueBoard projectKey="DOCS" />
  </ApolloProvider>,
);
