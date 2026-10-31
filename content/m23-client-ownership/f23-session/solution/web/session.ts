import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { TriageRouter } from '../services/triage';
import type { RelaySession, SessionOptions } from './session-contract';
export type { RelaySession } from './session-contract';
export function createSession(options: SessionOptions): RelaySession {
  const headers = { ...options.headers };
  const fetcher = options.fetcher ?? fetch;
  const endpoint = (path: string) => new URL(path, options.baseUrl).href;
  let closed = false;
  const assertOpen = () => {
    if (closed) throw Error('CLOSED');
  };
  const client = new ApolloClient({
    link: new HttpLink({ uri: endpoint('graphql'), headers, fetch: fetcher }),
    cache: new InMemoryCache({
      typePolicies: {
        Contact: { keyFields: ['tenant', 'id'] },
        Ticket: { keyFields: ['tenant', 'id'] },
      },
    }),
  });
  const trpc = createTRPCClient<TriageRouter>({
    links: [httpBatchLink({ url: endpoint('trpc'), headers, fetch: fetcher })],
  });
  async function request(path: string, body?: unknown) {
    assertOpen();
    const response = await fetcher(endpoint(path), {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(typeof result.error === 'string' ? result.error : 'HTTP ' + response.status);
    return result;
  }
  return {
    client,
    inbox: {
      accept: (input) => request('api/intake', input),
      triage: async (input) => {
        assertOpen();
        return trpc.triage.mutate(input);
      },
    },
    operations: {
      report: () => request('api/operations'),
      dispatch: (simulateFailure) => request('api/dispatch', { simulateFailure }),
    },
    stop: () => {
      if (!closed) {
        closed = true;
        client.stop();
      }
    },
  };
}
