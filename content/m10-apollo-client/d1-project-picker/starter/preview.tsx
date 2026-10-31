// Renders your component against the live reference Taskforge API. (Provided.)
import { createRoot } from 'react-dom/client';
import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { ProjectPicker } from './ProjectPicker';

const client = new ApolloClient({
  link: new HttpLink({ uri: '/reference/graphql' }),
  cache: new InMemoryCache(),
});

createRoot(document.getElementById('root')!).render(
  <ApolloProvider client={client}>
    <ProjectPicker />
  </ApolloProvider>,
);
