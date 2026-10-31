import { expect } from 'expect';
import { resetDb, execute } from '@forge/kit';
import { createServer } from '../server';
import { Post } from '../models/Post';
import { encodeCursor, decodeCursor } from '../feed';

const server = createServer();
const base = Date.UTC(2026, 9, 1);
const Q = `query($first: Int, $after: String) {
  feed(first: $first, after: $after) {
    edges { cursor node { text } }
    pageInfo { hasNextPage endCursor }
    totalCount
  }
}`;
const feed = async (first: number | undefined, after: string | null = null) => {
  const r: any = await execute(server, Q, first === undefined ? { after } : { first, after });
  return r;
};
const texts = (r: any) => r.data.feed.edges.map((e: any) => e.node.text);

async function walk(first: number) {
  const seen: string[] = [];
  let after: string | null = null;
  for (let i = 0; i < 50; i++) {
    const r = await feed(first, after);
    if (r.errors) throw new Error(r.errors[0].message);
    seen.push(...texts(r));
    if (!r.data.feed.pageInfo.hasNextPage) break;
    after = r.data.feed.pageInfo.endCursor;
  }
  return seen;
}

beforeEach(async () => {
  await resetDb();
  await Post.create(Array.from({ length: 7 }, (_, i) => ({ author: 'sam', text: `p${i + 1}`, createdAt: new Date(base + i * 60_000) })));
});

test('first page: newest first, default size 10, totals', async () => {
  const r = await feed(undefined);
  expect(texts(r)).toEqual(['p7', 'p6', 'p5', 'p4', 'p3', 'p2', 'p1']);
  expect(r.data.feed.pageInfo.hasNextPage).toBe(false);
  expect(r.data.feed.totalCount).toBe(7);
});

test('pages chain with endCursor → after', async () => {
  const p1 = await feed(3);
  expect(texts(p1)).toEqual(['p7', 'p6', 'p5']);
  expect(p1.data.feed.pageInfo.hasNextPage).toBe(true);
  expect(p1.data.feed.pageInfo.endCursor).toBe(p1.data.feed.edges[2].cursor);
  const p2 = await feed(3, p1.data.feed.pageInfo.endCursor);
  expect(texts(p2)).toEqual(['p4', 'p3', 'p2']);
  const p3 = await feed(3, p2.data.feed.pageInfo.endCursor);
  expect(texts(p3)).toEqual(['p1']);
  expect(p3.data.feed.pageInfo.hasNextPage).toBe(false);
  expect(p3.data.feed.totalCount).toBe(7);
}, { hint: 'Filter with $or on (createdAt, _id), sort the same way, and limit(first + 1).' });

test('exactly first items: hasNextPage is false (limit + 1, not a guess)', async () => {
  const r = await feed(7);
  expect(texts(r)).toHaveLength(7);
  expect(r.data.feed.pageInfo.hasNextPage).toBe(false);
});

test('an empty feed: no edges, endCursor null', async () => {
  await Post.deleteMany({});
  const r = await feed(5);
  expect(r.data.feed).toEqual({ edges: [], pageInfo: { hasNextPage: false, endCursor: null }, totalCount: 0 });
});

test('ties on createdAt: every post exactly once', async () => {
  await Post.deleteMany({});
  const same = new Date(base);
  await Post.create(Array.from({ length: 23 }, (_, i) => ({ author: 'bot', text: `t${i}`, createdAt: same })));
  const seen = await walk(5);
  expect(seen).toHaveLength(23);
  expect(new Set(seen).size).toBe(23);
}, { hint: 'The cursor must encode _id too, and the $or must use it for equal timestamps.' });

test('a new post created mid-scroll causes no duplicates on the next page', async () => {
  const p1 = await feed(3);
  await Post.create({ author: 'kai', text: 'brand new', createdAt: new Date(base + 999 * 60_000) });
  const p2 = await feed(3, p1.data.feed.pageInfo.endCursor);
  expect(texts(p2)).toEqual(['p4', 'p3', 'p2']);
});

test('first outside 1..50 → BAD_USER_INPUT', async () => {
  for (const first of [0, -1, 51, 1000]) {
    const r = await feed(first);
    expect(r.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    expect(r.errors?.[0]?.message).toBe('first must be between 1 and 50');
  }
});

test('invalid cursors → BAD_USER_INPUT "Invalid cursor"', async () => {
  const bogus = [
    'garbage!!',
    Buffer.from('{"a":1}').toString('base64url'),
    Buffer.from('[1,"not-an-id"]').toString('base64url'),
    Buffer.from('["x","66f1c2a9e4b0a1b2c3d4e5f6"]').toString('base64url'),
  ];
  for (const after of bogus) {
    const r = await feed(3, after);
    expect(r.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    expect(r.errors?.[0]?.message).toBe('Invalid cursor');
  }
}, { hint: 'Wrap decoding in try/catch and validate the parsed shape before using it.' });

test('encodeCursor / decodeCursor round-trip', async () => {
  const p: any = await Post.findOne({ text: 'p3' });
  const c = decodeCursor(encodeCursor(p));
  expect(c.createdAt.getTime()).toBe(p.createdAt.getTime());
  expect(String(c.id)).toBe(String(p._id));
});

test('tied timestamps page cleanly with no index to lean on', async () => {
  await Post.collection.updateMany({}, { $set: { createdAt: new Date(Date.UTC(2026, 0, 1)) } });
  await Post.collection.dropIndexes();
  try {
    const seen = await walk(3);
    expect(new Set(seen).size).toBe(7);
    expect(seen).toHaveLength(7);
  } finally {
    await Post.syncIndexes();
  }
}, { hint: 'The sort needs the same tie-break as the cursor.' });
