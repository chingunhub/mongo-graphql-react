// Preview (provided): your IssueList, your Apollo client, the live reference API, logged in as Ada.
import { createRoot } from 'react-dom/client';
import { ApolloProvider } from '@apollo/client/react';
import { createApolloClient } from './apollo';
import { IssueList } from './components/IssueList';
import { demoLogin } from './dev/demoSession';

const token = await demoLogin();
const client = createApolloClient({ uri: '/reference/graphql', getToken: () => token });

createRoot(document.getElementById('root')!).render(
  <ApolloProvider client={client}>
    <IssueList projectKey="TF" />
  </ApolloProvider>,
);
