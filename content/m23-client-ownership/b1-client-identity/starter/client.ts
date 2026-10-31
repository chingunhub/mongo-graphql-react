import { ApolloClient, InMemoryCache, type ApolloLink } from '@apollo/client';
let shared: ApolloClient | undefined;
export function createLibraryClient(tenant: string, link: ApolloLink) {
  shared ??= new ApolloClient({ link, cache: new InMemoryCache() });
  return shared;
}
