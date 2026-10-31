import { expect } from 'expect';
import { ApolloLink, Observable } from '@apollo/client';
import { createLibraryClient } from '../client';
import { BOOK } from '../catalogue';
function link(library: string, calls: string[]) {
  return new ApolloLink(
    () =>
      new Observable((observer) => {
        calls.push(library);
        observer.next({
          data: {
            book: {
              __typename: 'Book',
              library,
              id: '7',
              title: library + ' title',
            },
          },
        });
        observer.complete();
      }),
  );
}
test('switching identities cannot reuse the previous session cache', async () => {
  const calls: string[] = [];
  const north = createLibraryClient('north', link('north', calls));
  const south = createLibraryClient('south', link('south', calls));
  try {
    expect((await north.query({ query: BOOK })).data.book.title).toBe('north title');
    expect((await south.query({ query: BOOK })).data.book.title).toBe('south title');
    expect(calls).toEqual(['north', 'south']);
  } finally {
    north.stop();
    south.stop();
  }
});
test('the same identity session still benefits from cache hits', async () => {
  const calls: string[] = [];
  const client = createLibraryClient('north', link('north', calls));
  try {
    await client.query({ query: BOOK });
    await client.query({ query: BOOK });
    expect(calls).toEqual(['north']);
  } finally {
    client.stop();
  }
});
test('entity keys retain the library dimension even inside one cache', () => {
  const client = createLibraryClient('north', link('north', []));
  try {
    expect(client.cache.identify({ __typename: 'Book', library: 'north', id: '7' })).not.toBe(
      client.cache.identify({ __typename: 'Book', library: 'south', id: '7' }),
    );
  } finally {
    client.stop();
  }
});
