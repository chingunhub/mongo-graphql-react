// Preview (provided): your feed on the live reference API, with your cache.
import { createRoot } from 'react-dom/client';
import { ApolloClient, HttpLink } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { createFeedCache } from './feedCache';
import { IssueFeed } from './IssueFeed';

const client = new ApolloClient({ link: new HttpLink({ uri: '/reference/graphql' }), cache: createFeedCache() });

createRoot(document.getElementById('root')!).render(
  <ApolloProvider client={client}>
    <IssueFeed projectKey="TF" pageSize={5} />
  </ApolloProvider>,
);
