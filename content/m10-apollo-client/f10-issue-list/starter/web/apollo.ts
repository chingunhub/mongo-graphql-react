import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { SetContextLink } from '@apollo/client/link/context';

export interface ClientOptions {
  /** GraphQL endpoint, e.g. "/graphql". */
  uri: string;
  /** Called for EVERY request; return the current token or null. */
  getToken?: () => string | null;
  /** Optional fetch implementation (tests pass a fake one). */
  fetch?: typeof fetch;
}

/** The cache — its configuration grows in module 12. */
export function createCache() {
  // TODO
  return new InMemoryCache();
}

export function createApolloClient({ uri, getToken = () => null, fetch }: ClientOptions) {
  // TODO: an auth link that adds "authorization: Bearer <token>" when there is a token,
  // concatenated with an HttpLink({ uri, fetch }), and the cache from createCache().
  return new ApolloClient({ link: new HttpLink({ uri, fetch }), cache: createCache() });
}
