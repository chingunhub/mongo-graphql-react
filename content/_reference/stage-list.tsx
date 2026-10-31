// Your IssueList and Apollo client on your own API, until the whole app exists in module 12.
import { createRoot } from 'react-dom/client';
import { ApolloProvider } from '@apollo/client/react';
import { createApolloClient } from './apollo';
import { IssueList } from './components/IssueList';
import { demoLogin } from './dev/demoSession';

const uri = '/mine/graphql';
const token = await demoLogin(uri);
const client = createApolloClient({ uri, getToken: () => token });

createRoot(document.getElementById('root')!).render(
  <ApolloProvider client={client}>
    <IssueList projectKey="TF" />
  </ApolloProvider>,
);
