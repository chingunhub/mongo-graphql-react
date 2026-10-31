import { expect } from 'expect';
import { resetDb, execute, countQueries } from '@forge/kit';
import { createServer } from '../server';
import { createContext } from '../context';
import { createLoaders } from '../loaders';
import { Article } from '../models/Article';
import { Author } from '../models/Author';
import { Comment } from '../models/Comment';

const server = createServer();
const FULL = '{ articles { title author { name } reviewers { name } commentCount } }';
const raw = (q: string) => execute(server, q, undefined, createContext()) as Promise<any>;
const ok = async (q: string) => {
  const r = await raw(q);
  if (r.errors?.length) throw new Error(r.errors.map((e: any) => e.message).join('; '));
  return r.data;
};
const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));

let nell: any, ida: any, ernest: any, joan: any, oriana: any;
let report: any, expose: any, scoop: any;
beforeEach(async () => {
  await resetDb();
  [nell, ida, ernest, joan, oriana] = await Author.create(
    ['Nellie Bly', 'Ida Tarbell', 'Ernest Pyle', 'Joan Didion', 'Oriana Fallaci'].map((name) => ({ name })),
  );
  // Newest first the authors arrive as oriana, joan, ida: not the order they were created in.
  report = await Article.create({ title: 'Report', author: ida._id, reviewers: [nell._id], publishedAt: day(0) });
  expose = await Article.create({ title: 'Exposé', author: joan._id, reviewers: [ernest._id, nell._id, ida._id], publishedAt: day(1) });
  scoop = await Article.create({ title: 'Scoop', author: oriana._id, reviewers: [joan._id], publishedAt: day(2) });
  await Comment.create([
    { article: report._id, body: 'a' },
    { article: expose._id, body: 'b' },
    { article: expose._id, body: 'c' },
    { article: scoop._id, body: 'd' },
  ]);
});

test('symptom 1: every article shows its own author', async () => {
  const d = await ok('{ articles { title author { id name } } }');
  expect(d.articles).toEqual([
    { title: 'Scoop', author: { id: String(oriana._id), name: 'Oriana Fallaci' } },
    { title: 'Exposé', author: { id: String(joan._id), name: 'Joan Didion' } },
    { title: 'Report', author: { id: String(ida._id), name: 'Ida Tarbell' } },
  ]);
}, { hint: 'DataLoader matches values to keys by position. MongoDB returns rows in its own order, so put them back in the order of the keys.' });

test('symptom 1: the loader itself lines values up with its keys', async () => {
  const loader = createLoaders().authorById;
  const names = await Promise.all([oriana, nell, joan].map((a) => loader.load(String(a._id))));
  expect(names.map((a: any) => a.name)).toEqual(['Oriana Fallaci', 'Nellie Bly', 'Joan Didion']);
});

test('symptom 2: a deleted author is null on that article only', async () => {
  await joan.deleteOne();
  const r = await raw('{ articles { title author { name } } }');
  expect(r.errors).toBeUndefined();
  expect(r.data.articles).toEqual([
    { title: 'Scoop', author: { name: 'Oriana Fallaci' } },
    { title: 'Exposé', author: null },
    { title: 'Report', author: { name: 'Ida Tarbell' } },
  ]);
}, { hint: 'A batch function returns exactly one value per key. If a key found nothing, its value is null. A shorter list makes DataLoader reject every key in the batch.' });

test('symptom 2: a deleted reviewer drops off the list and the page survives', async () => {
  await nell.deleteOne();
  const d = await ok('{ articles { title reviewers { name } } }');
  expect(d.articles).toEqual([
    { title: 'Scoop', reviewers: [{ name: 'Joan Didion' }] },
    { title: 'Exposé', reviewers: [{ name: 'Ernest Pyle' }, { name: 'Ida Tarbell' }] },
    { title: 'Report', reviewers: [] },
  ]);
}, { hint: 'The schema promises [Author!]!, so a null inside the list blanks the page. Filter the empties out after loading.' });

test('symptom 3: an article with no comments counts 0', async () => {
  await Article.create({ title: 'Breaking', author: nell._id, reviewers: [], publishedAt: day(3) });
  const r = await raw('{ articles { title commentCount } }');
  expect(r.errors).toBeUndefined();
  expect(r.data.articles).toEqual([
    { title: 'Breaking', commentCount: 0 },
    { title: 'Scoop', commentCount: 1 },
    { title: 'Exposé', commentCount: 2 },
    { title: 'Report', commentCount: 1 },
  ]);
}, { hint: '$group has no row for an article with no comments. Default to 0 when you walk the keys.' });

test('symptom 3: counts land on the right article whatever order the keys arrive in', async () => {
  const loader = createLoaders().commentCountByArticle;
  const counts = await Promise.all([expose, report, scoop].map((a) => loader.load(String(a._id))));
  expect(counts).toEqual([2, 1, 1]);
});

test('reviewers keep the order stored on the article', async () => {
  const d = await ok(FULL);
  expect(d.articles[1].reviewers.map((a: any) => a.name)).toEqual(['Ernest Pyle', 'Nellie Bly', 'Ida Tarbell']);
});

test('symptom 4: three queries, even with many reviewers on each article', async () => {
  const authors = await Author.create(Array.from({ length: 24 }, (_, i) => ({ name: `Reviewer ${i}` })));
  for (let i = 0; i < 4; i++)
    await Article.create({ title: `Long read ${i}`, author: nell._id, reviewers: authors.slice(i * 6, i * 6 + 6).map((a) => a._id), publishedAt: day(10 + i) });
  const spy = await countQueries(() => ok(FULL));
  expect(spy.result.articles[0].reviewers).toHaveLength(6);
  expect(spy.count).toBe(3);
}, { hint: 'Each `await load` inside the loop waits for a whole batch before asking for the next id, so one list costs many batches. Ask for all the ids at once.' });

test('symptom 4: the count stays flat as articles are added', async () => {
  const small = await countQueries(() => ok(FULL));
  for (let i = 0; i < 12; i++)
    await Article.create({ title: `Extra ${i}`, author: nell._id, reviewers: [ernest._id, joan._id], publishedAt: day(20 + i) });
  const big = await countQueries(() => ok(FULL));
  expect(big.count).toBe(small.count);
});

test('a loader never outlives its request', async () => {
  await ok('{ articles { author { name } } }');
  await Author.updateOne({ _id: ida._id }, { $set: { name: 'Ida M. Tarbell' } });
  const d = await ok('{ articles { author { name } } }');
  expect(d.articles[2].author.name).toBe('Ida M. Tarbell');
});
