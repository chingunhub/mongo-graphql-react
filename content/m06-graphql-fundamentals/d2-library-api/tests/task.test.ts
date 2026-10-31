import { expect } from 'expect';
import { execute } from '@forge/kit';
import { createServer } from '../server';
import { books } from '../data';

const server = createServer();
const q = (query: string, variables?: Record<string, unknown>) => execute(server, query, variables);
const ok = async (query: string, variables?: Record<string, unknown>) => {
  const r: any = await q(query, variables);
  if (r.errors?.length) throw new Error(r.errors.map((e: any) => e.message).join('; '));
  return r.data;
};

test('createServer returns an ApolloServer', () => {
  expect(server).toBeTruthy();
  expect(typeof (server as any).executeOperation).toBe('function');
});

test('books returns every book, oldest first', async () => {
  const data = await ok('{ books { title year } }');
  expect(data.books.map((b: any) => b.year)).toEqual([1968, 1974, 1979, 1993, 2015]);
}, { hint: 'Sort by year — and copy before sorting so you never reorder the shared array.' });

test('books(genre) filters by genre', async () => {
  const data = await ok('{ books(genre: SCIFI) { title } }');
  expect(data.books.map((b: any) => b.title)).toEqual(['The Dispossessed', 'Parable of the Sower']);
});

test('the shared data array is not reordered', async () => {
  await ok('{ books { title } }');
  expect(books.slice(0, 2).map((b) => b.id)).toEqual(['b1', 'b2']);
});

test('book(id) finds one book or returns null', async () => {
  expect(await ok('{ book(id: "b3") { title genre } }')).toEqual({ book: { title: 'Kindred', genre: 'FICTION' } });
  expect(await ok('{ book(id: "nope") { title } }')).toEqual({ book: null });
});

test('Book.author resolves from authorId', async () => {
  const data = await ok('{ book(id: "b5") { author { name born } } }');
  expect(data.book.author).toEqual({ name: 'Mary Beard', born: 1955 });
}, { hint: 'The book object has authorId, not author. Add a Book.author resolver.' });

test('Author.books lists that author’s books, oldest first', async () => {
  const data = await ok('{ authors { name books { title } } }');
  expect(data.authors[0]).toEqual({
    name: 'Ursula K. Le Guin',
    books: [{ title: 'A Wizard of Earthsea' }, { title: 'The Dispossessed' }],
  });
  expect(data.authors[2].books).toEqual([{ title: 'SPQR' }]);
});

test('the graph goes both ways: book → author → books', async () => {
  const data = await ok('{ book(id: "b3") { author { books { title } } } }');
  expect(data.book.author.books.map((b: any) => b.title)).toEqual(['Kindred', 'Parable of the Sower']);
});

const ADD = `mutation Add($input: AddBookInput!) { addBook(input: $input) { id title year genre author { name } } }`;

test('addBook creates a book and returns it with its author', async () => {
  const data = await ok(ADD, { input: { title: 'The Lathe of Heaven', year: 1971, genre: 'SCIFI', authorId: 'au1' } });
  expect(data.addBook).toMatchObject({ title: 'The Lathe of Heaven', year: 1971, genre: 'SCIFI', author: { name: 'Ursula K. Le Guin' } });
  expect(typeof data.addBook.id).toBe('string');
  const after = await ok('{ books(genre: SCIFI) { title } }');
  expect(after.books.map((b: any) => b.title)).toContain('The Lathe of Heaven');
}, { hint: 'Add `input AddBookInput` and `type Mutation` to the SDL, then a Mutation.addBook resolver.' });

test('new books get unique ids', async () => {
  const input = { title: 'Twin', year: 2000, genre: 'FICTION', authorId: 'au2' };
  const a = await ok(ADD, { input });
  const b = await ok(ADD, { input });
  expect(a.addBook.id).not.toBe(b.addBook.id);
});

test('addBook with an unknown author fails with "Unknown author"', async () => {
  const r: any = await q(ADD, { input: { title: 'Ghost', year: 2000, genre: 'FICTION', authorId: 'nobody' } });
  expect(r.errors?.[0]?.message).toBe('Unknown author');
  expect(r.data).toBeNull();
});

test('invalid enum values are rejected before resolvers run', async () => {
  const r: any = await q('{ books(genre: POETRY) { title } }');
  expect(r.errors?.length).toBeGreaterThan(0);
});
