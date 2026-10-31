import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { SetContextLink } from '@apollo/client/link/context';
import { relayStylePagination } from '@apollo/client/utilities';

export interface ClientOptions {
  /** GraphQL endpoint, e.g. "/graphql". */
  uri: string;
  /** Called for EVERY request; return the current token or null. */
  getToken?: () => string | null;
  /** Optional fetch implementation (tests pass a fake one). */
  fetch?: typeof fetch;
}

export function createCache() {
  return new InMemoryCache({
    typePolicies: {
      Project: {
        fields: {
          // Pages of the same filter merge into one list; different filters stay separate.
          issueConnection: relayStylePagination(['filter']),
        },
      },
    },
  });
}

export function createApolloClient({ uri, getToken = () => null, fetch }: ClientOptions) {
  // Runs per request, so a token obtained after the client was created is still used.
  const auth = new SetContextLink((prevContext) => {
    const token = getToken();
    return {
      headers: { ...prevContext.headers, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    };
  });
  return new ApolloClient({
    link: auth.concat(new HttpLink({ uri, fetch })),
    cache: createCache(),
  });
}
