import { InMemoryCache } from '@apollo/client';

export function createFeedCache() {
  return new InMemoryCache({
    // TODO: typePolicies → Project → fields → issueConnection { keyArgs, merge }
  });
}
