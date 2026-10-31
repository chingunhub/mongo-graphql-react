import { ApolloClient, InMemoryCache, type ApolloLink } from '@apollo/client';
export function createLibraryClient(tenant: string, link: ApolloLink) {
  return new ApolloClient({
    link,
    cache: new InMemoryCache({
      typePolicies: { Book: { keyFields: ['library', 'id'] } },
    }),
  });
}
