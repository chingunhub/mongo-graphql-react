import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENT_DIR } from '../server/paths';
import { runJob } from '../server/runner';

// Lessons in modules 0-13 show fragments, so each case runs the exact text of a block
// from the lesson, with only the setup around it supplied here.
function shown(lesson: string, start: string, end?: string) {
  const markdown = readFileSync(join(CONTENT_DIR, lesson), 'utf8').replace(/\r\n/g, '\n');
  const blocks = [...markdown.matchAll(/^```(?:ts|tsx)[^\n]*\n(.*?)^```/gms)].map((m) => m[1]);
  const block = blocks.find((b) => b.includes(start));
  assert.ok(block, `${lesson} no longer shows: ${start}`);
  const from = block.slice(block.indexOf(start));
  if (!end) return from;
  assert.ok(from.includes(end), `${lesson} no longer shows: ${end}`);
  return from.slice(0, from.indexOf(end));
}

async function check(code: string, tests: string, opts: { db?: boolean; dom?: boolean } = {}) {
  const ext = opts.dom ? 'tsx' : 'ts';
  const result = await runJob({
    mode: 'test',
    env: opts.dom ? 'dom' : 'node',
    db: opts.db ?? false,
    files: { [`example.${ext}`]: code },
    tests: { [`task.test.${ext}`]: `import { expect } from 'expect';\n${tests}` },
  });
  assert.equal(result.ok, true, JSON.stringify(result, null, 2).slice(0, 2000));
}

const BOOK = `
  import mongoose, { Schema } from 'mongoose';
  const bookSchema = new Schema({
    title: String, author: String, year: Number, isbn: String, tags: [String],
    rating: { type: Number, min: 1, max: 5 }, copiesLeft: { type: Number, min: 0 },
  });
  export const Book = mongoose.model('Book', bookSchema);
`;
const CLEAN = `
  import { resetDb } from '@forge/kit';
  beforeEach(resetDb);
`;

test('m01: a document has its _id before it is saved', async () => {
  await check(
    `${BOOK}
    export async function run() {
      ${shown('m01-mongoose-basics/l2-schema-model-document.md', '// 1. build, then save')}
      return [book, book2];
    }`,
    `${CLEAN}
    import { Book, run } from '../example';
    test('both are stored', async () => {
      const [a, b] = await run();
      expect(a._id).toBeTruthy();
      expect((await Book.find().sort({ year: 1 })).map((x: any) => x.id)).toEqual([a.id, b.id]);
    });`,
    { db: true },
  );
});

test('m01: the chained query filters, sorts, limits and projects', async () => {
  await check(
    `${BOOK}
    export async function run() {
      ${shown('m01-mongoose-basics/l2-schema-model-document.md', "const recent = await Book.find({ tags: 'scifi' })")}
      return recent;
    }`,
    `${CLEAN}
    import { Book, run } from '../example';
    test('newest five scifi books', async () => {
      await Book.create([...Array(7)].map((_, i) => ({ title: 'B' + i, year: 1990 + i, author: 'x', tags: ['scifi'] })));
      await Book.create({ title: 'Other', year: 2020, tags: ['poetry'] });
      const r: any[] = await run();
      expect(r.map((b) => b.year)).toEqual([1996, 1995, 1994, 1993, 1992]);
      expect(r[0].author).toBeUndefined();
    });`,
    { db: true },
  );
});

test('m02: fieldErrors produces the messages the lesson prints', async () => {
  const schema = shown('m02-schema-design/l1-validation.md', 'const bookSchema = new Schema({\n  title: {');
  await check(
    `import mongoose, { Schema } from 'mongoose';
    ${schema}
    export const Book = mongoose.model('Book', bookSchema.add({ year: Number }));
    ${shown('m02-schema-design/l1-validation.md', 'function fieldErrors').replace('function', 'export function')}`,
    `import { Book, fieldErrors } from '../example';
    test('every failure is named by path', async () => {
      const err: any = await new Book({ title: '', rating: 9, year: 'soon' }).validate().catch((e: unknown) => e);
      const out = fieldErrors(err);
      expect(out.title).toBe('Every book needs a title');
      expect(out.rating).toMatch(/is more than/);
      expect(out.year).toMatch(/Cast to Number failed/);
    });`,
    { db: true },
  );
});

test('m02: a default function runs per document', async () => {
  await check(
    `import mongoose, { Schema } from 'mongoose';
    export const Post = mongoose.model('Post', new Schema({
      ${shown('m02-schema-design/l1-validation.md', "status: { type: String, default: 'DRAFT' },")}
    }));`,
    `import { Post } from '../example';
    test('each document gets its own time', async () => {
      const a: any = new Post();
      await new Promise((r) => setTimeout(r, 5));
      const b: any = new Post();
      expect(a.status).toBe('DRAFT');
      expect(b.publishedAt.getTime()).toBeGreaterThan(a.publishedAt.getTime());
    });`,
    { db: true },
  );
});

test('m02: subdocuments edit in memory, then save as one write', async () => {
  await check(
    `import mongoose, { Schema } from 'mongoose';
    const reviewSchema = new Schema({ rating: Number, by: String, text: String });
    export const Book = mongoose.model('Book', new Schema({
      ${shown('m02-schema-design/l2-subdocuments.md', 'reviews: {\n  type: [reviewSchema]')}
    }));
    export async function run(bookId: any, reviewId: any, otherReviewId: any) {
      ${shown('m02-schema-design/l2-subdocuments.md', 'const book = await Book.findById(bookId);')}
    }`,
    `${CLEAN}
    import { Book, run } from '../example';
    test('push, edit and pull', async () => {
      const b: any = await Book.create({ reviews: [{ rating: 2, by: 'a' }, { rating: 3, by: 'b' }] });
      await run(b._id, b.reviews[0]._id, b.reviews[1]._id);
      const stored: any = await Book.findById(b._id);
      expect(stored.reviews.map((r: any) => r.by)).toEqual(['a', 'mo']);
      expect(stored.reviews[0].text).toBe('Changed my mind');
    });
    test('the array validator stops the 101st review', async () => {
      const b: any = new Book({ reviews: [...Array(101)].map(() => ({ rating: 1 })) });
      await expect(b.validate()).rejects.toThrow('at most 100 reviews');
    });`,
    { db: true },
  );
});

test('m03: escapeRegex makes user input match literally', async () => {
  await check(
    `export function build(input: string) {
      const filter: any = {};
      ${shown('m03-querying/l1-queries.md', 'const escapeRegex =')}
      return filter;
    }`,
    `import { build } from '../example';
    test('metacharacters lose their meaning', () => {
      const f = build(' c++ (3rd) ');
      const re = new RegExp(f.title.$regex, f.title.$options);
      expect(re.test('C++ (3rd) Edition')).toBe(true);
      expect(new RegExp(build('a.c').title.$regex).test('abc')).toBe(false);
    });`,
  );
});

test('m03: the list-and-total pattern reports the page count', async () => {
  await check(
    `${BOOK}
    export async function run(filter: any, order: any, skip: number, pageSize: number) {
      ${shown('m03-querying/l1-queries.md', 'const [items, total] = await Promise.all([')}
    }`,
    `${CLEAN}
    import { Book, run } from '../example';
    test('45 books at 20 a page is 3 pages', async () => {
      await Book.create([...Array(45)].map((_, i) => ({ title: 'B' + i, year: i })));
      const r = await run({}, { year: 1 }, 40, 20);
      expect(r.total).toBe(45);
      expect(r.pages).toBe(3);
      expect(r.items).toHaveLength(5);
    });`,
    { db: true },
  );
});

test('m03: validators on updates behave as the lesson warns', async () => {
  const lesson = 'm03-querying/l2-updates.md';
  await check(
    `${BOOK}
    export const noValidators = (id: any) => (async () => {
      ${shown(lesson, 'await Book.updateOne({ _id: id }, { $set: { rating: 99 } }); //')}
    })();
    export const withValidators = (id: any) => (async () => {
      ${shown(lesson, 'await Book.updateOne({ _id: id }, { $set: { rating: 99 } }, { runValidators: true });')}
    })();
    export const decrement = (id: any) => (async () => {
      ${shown(lesson, 'await Book.updateOne({ _id: id }, { $inc: { copiesLeft: -5 } }')}
    })();
    export const addTag = (id: any, tag: any) => (async () => {
      ${shown(lesson, 'await Book.updateOne(\n  { _id: id, ')}
    })();`,
    `${CLEAN}
    import { Book, noValidators, withValidators, decrement } from '../example';
    test('$set skips validators by default', async () => {
      const b = await Book.create({ title: 'x', rating: 3 });
      await noValidators(b._id);
      expect((await Book.findById(b._id))!.rating).toBe(99);
    });
    test('runValidators rejects it', async () => {
      const b = await Book.create({ title: 'x', rating: 3 });
      await expect(withValidators(b._id)).rejects.toThrow('Validation failed');
      expect((await Book.findById(b._id))!.rating).toBe(3);
    });
    test('$inc is not checked even with runValidators', async () => {
      const b = await Book.create({ title: 'x', copiesLeft: 1 });
      await decrement(b._id);
      expect((await Book.findById(b._id))!.copiesLeft).toBe(-4);
    });`,
    { db: true },
  );
});

test('m03: the guarded $push adds a tag once', async () => {
  await check(
    `import mongoose, { Schema } from 'mongoose';
    export const Book = mongoose.model('Book', new Schema({ tags: [{ name: String }] }));
    export const addTag = (id: any, tag: any) => (async () => {
      ${shown('m03-querying/l2-updates.md', 'await Book.updateOne(\n  { _id: id, ')}
    })();`,
    `${CLEAN}
    import { Book, addTag } from '../example';
    test('the second call changes nothing', async () => {
      const b: any = await Book.create({ tags: [] });
      await addTag(b._id, { name: 'scifi' });
      await addTag(b._id, { name: 'scifi' });
      expect((await Book.findById(b._id) as any).tags).toHaveLength(1);
    });`,
    { db: true },
  );
});

test('m04: one query per book is the N+1 the lesson counts', async () => {
  const lesson = 'm04-relationships/l1-embed-or-reference.md';
  await check(
    `import mongoose, { Schema } from 'mongoose';
    export const Author = mongoose.model('Author', new Schema({ name: String }));
    export const Book = mongoose.model('Book', new Schema({ title: String, author: { type: Schema.Types.ObjectId, ref: 'Author' } }));
    export async function loop() {
      ${shown(lesson, 'const books = await Book.find();\nfor')}
    }
    export const populated = () => Book.findOne({ title: 'Kindred' }).populate('author');
    export function compare(book: any, author: any) {
      return [
        ${shown(lesson, 'book.author === author._id;').split('\n').filter(Boolean).map((l) => l.split(';')[0]).join(',\n')}
      ];
    }`,
    `${CLEAN}
    import { countQueries } from '@forge/kit';
    import { Author, Book, loop, compare } from '../example';
    test('1 + N queries', async () => {
      const a = await Author.create({ name: 'Octavia E. Butler' });
      await Book.create([{ title: 'Kindred', author: a._id }, { title: 'Dawn', author: a._id }, { title: 'Wild Seed', author: a._id }]);
      expect((await countQueries(loop)).count).toBe(4);
    });
    test('ObjectIds compare by value, never with ===', async () => {
      const a: any = await Author.create({ name: 'x' });
      const b: any = await Book.create({ title: 'y', author: a._id });
      expect(compare(await Book.findById(b._id), a)).toEqual([false, true, true]);
    });`,
    { db: true },
  );
});

test('m04: virtual populate options and count work as shown', async () => {
  const lesson = 'm04-relationships/l2-virtuals.md';
  const start = '// define a default order on the virtual';
  const defs = shown(lesson, start, '// or pass them when populating');
  const count = shown(lesson, "authorSchema.virtual('bookCount'", 'await Author.findById(id)');
  await check(
    `import mongoose, { Schema } from 'mongoose';
    const authorSchema = new Schema({ name: String });
    ${defs}
    ${count}
    export const Author = mongoose.model('Author', authorSchema);
    export const Book = mongoose.model('Book', new Schema({ title: String, year: Number, format: String, author: { type: Schema.Types.ObjectId, ref: 'Author' } }));
    export function paperOnly(id: any) {
      return ${shown(lesson, 'Author.findById(id).populate({\n  path: \'books\'', '// count instead').trim().replace(/;$/, '')};
    }
    export const counted = (id: any) => (async () => {
      return ${shown(lesson, "await Author.findById(id).populate('bookCount');", ';')};
    })();`,
    `${CLEAN}
    import { Author, Book, paperOnly, counted } from '../example';
    test('match, select, sort and count', async () => {
      const a: any = await Author.create({ name: 'x' });
      await Book.create([
        { title: 'New', year: 2000, format: 'HARDCOVER', author: a._id },
        { title: 'Old', year: 1950, format: 'PAPERBACK', author: a._id },
        { title: 'Digital', year: 1970, format: 'EBOOK', author: a._id },
      ]);
      const out: any = await paperOnly(a._id);
      // The sort on the virtual wins over the one passed to populate, as the lesson warns.
      expect(out.books.map((b: any) => b.title)).toEqual(['New', 'Old']);
      expect((await counted(a._id) as any).bookCount).toBe(3);
    });`,
    { db: true },
  );
});

test('m05: methods, statics and the duplicate-key hook', async () => {
  const lesson = 'm05-middleware-aggregation/l1-hooks-methods.md';
  await check(
    `import mongoose, { Schema } from 'mongoose';
    const bookSchema = new Schema({ isbn: String, year: Number });
    ${shown(lesson, '// instance method: behavior of ONE document')}
    export const Book: any = mongoose.model('Book', bookSchema);
    export async function run() {
      ${shown(lesson, "const book = await Book.findByIsbn('978-0-8070-8305-4');").replace('book?.isClassic();', 'return book?.isClassic();')}
    }
    const userSchema = new Schema({ email: { type: String, unique: true } });
    ${shown(lesson, "userSchema.post('save', function (error: any")}
    export const User = mongoose.model('User', userSchema);`,
    `${CLEAN}
    import { ensureIndexes } from '@forge/kit';
    import { Book, User, run } from '../example';
    test('the static cleans the isbn and the method reads the document', async () => {
      await Book.create({ isbn: '9780807083054', year: 1960 });
      expect(await run()).toBe(true);
    });
    test('the hook turns E11000 into a sentence', async () => {
      await ensureIndexes(User);
      await User.create({ email: 'a@b.c' });
      await expect(User.create({ email: 'a@b.c' })).rejects.toThrow('That email is already registered');
    });`,
    { db: true },
  );
});

test('m05: both aggregation pipelines return what the lesson prints', async () => {
  const lesson = 'm05-middleware-aggregation/l2-aggregation.md';
  await check(
    `import mongoose, { Schema } from 'mongoose';
    export const Book = mongoose.model('Book', new Schema({ title: String }));
    export const Review = mongoose.model('Review', new Schema({ book: Schema.Types.ObjectId, rating: Number }));
    export const top = () => ${shown(lesson, "{ $match: { rating: { $gte: 1 } } },") && shown(lesson, 'await Review.aggregate([\n  { $match').trim().replace(/;$/, '')};
    export const titled = () => ${shown(lesson, "{ $project: { _id: 0, title: '$book.title'") && shown(lesson, 'await Review.aggregate([\n  { $group', '// [ {').trim().replace(/;$/, '')};`
      .replace(/=> await /g, '=> '),
    `${CLEAN}
    import { Book, Review, top, titled } from '../example';
    test('averages, order and the joined title', async () => {
      const [beloved, kindred, dune] = await Book.create([{ title: 'Beloved' }, { title: 'Kindred' }, { title: 'Dune' }]);
      await Review.create([
        { book: beloved._id, rating: 5 }, { book: kindred._id, rating: 5 }, { book: kindred._id, rating: 4 },
        { book: dune._id, rating: 3 },
      ]);
      expect((await top()).map((r: any) => [String(r._id), r.avg, r.reviews])).toEqual([
        [String(beloved._id), 5, 1], [String(kindred._id), 4.5, 2],
      ]);
      expect((await titled()).slice(0, 2)).toEqual([{ title: 'Beloved', avg: 5 }, { title: 'Kindred', avg: 4.5 }]);
    });`,
    { db: true },
  );
});

test('m06: the default resolver reads properties and calls methods', async () => {
  await check(
    `export ${shown('m06-graphql-fundamentals/l3-execution.md', 'function defaultResolver(parent, args, context, info)')}`,
    `import { defaultResolver } from '../example';
    test('value or function', () => {
      expect(defaultResolver({ title: 'x' }, {}, {}, { fieldName: 'title' })).toBe('x');
      const obj = { n: 2, double(args: any) { return this.n * args.by; } };
      expect(defaultResolver(obj, { by: 3 }, {}, { fieldName: 'double' })).toBe(6);
      expect(defaultResolver({}, {}, {}, { fieldName: 'missing' })).toBeUndefined();
    });`,
  );
});

test('m07: what a resolver may return', async () => {
  const lesson = 'm07-resolvers/l1-resolver-anatomy.md';
  await check(
    `${BOOK}
    import { ApolloServer } from '@apollo/server';
    const typeDefs = '#graphql\\n type Book { id: ID! title: String } type Query { book(id: ID!): Book books: [Book!]! }';
    export const unawaited = new ApolloServer({ typeDefs, resolvers: {
      ${shown(lesson, 'book: (_parent, { id }) => Book.findById(id), //').replace(/^/, 'Query: {\n')}
    } });
    export const correct = new ApolloServer({ typeDefs, resolvers: {
      Query: {
        ${shown(lesson, 'book: async (_parent, { id }) => await Book.findById(id)', '},')}
      },
    } });
    ${shown(lesson, 'const idOf = (ref)').replace('const', 'export const')}`,
    `${CLEAN}
    import { execute } from '@forge/kit';
    import { Book, unawaited, correct, idOf } from '../example';
    const QUERY = 'query($id: ID!) { book(id: $id) { title } }';
    test('the unawaited Query', async () => {
      await unawaited.start();
      const b = await Book.create({ title: 'Dune' });
      const r = await execute(unawaited, QUERY, { id: b.id }, {});
      expect(r.errors[0].message).toMatch(/Query was already executed/);
    });
    test('async and exec both work', async () => {
      await correct.start();
      const b = await Book.create({ title: 'Dune' });
      expect((await execute(correct, QUERY, { id: b.id }, {})).data.book.title).toBe('Dune');
      expect((await execute(correct, '{ books { title } }', {}, {})).data.books).toHaveLength(1);
    });
    test('idOf takes an id or a populated document', () => {
      expect(idOf({ _id: 'a' })).toBe('a');
      expect(idOf('b')).toBe('b');
      expect(idOf(null)).toBe(null);
    });`,
    { db: true },
  );
});

test('m07: translating an input keeps null and skips undefined', async () => {
  await check(
    `export function toPatch(input: any) {
      ${shown('m07-resolvers/l2-mutations-modules.md', 'const { bookId, ...patch } = input;')}
      return patch;
    }`,
    `import { toPatch } from '../example';
    test('three cases', () => {
      expect(toPatch({ title: 'x' })).toEqual({ title: 'x' });
      expect(toPatch({ bookId: null })).toEqual({ book: null });
      expect(toPatch({ bookId: 'b1' }).book).toBe('b1');
    });`,
  );
});

test('m07: updateReview throws NOT_FOUND and validates the patch', async () => {
  const block = shown('m07-resolvers/l2-mutations-modules.md', "import { GraphQLError } from 'graphql';");
  const [imports, ...rest] = block.split('\n\n');
  await check(
    `${imports}
    import mongoose, { Schema } from 'mongoose';
    export const Review = mongoose.model('Review', new Schema({ rating: { type: Number, max: 5 } }));
    export const mutations = {
      ${rest.join('\n\n')}
    };`,
    `${CLEAN}
    import mongoose from 'mongoose';
    import { Review, mutations } from '../example';
    test('missing, invalid and valid', async () => {
      const missing = String(new mongoose.Types.ObjectId());
      await expect(mutations.updateReview(null, { id: missing, input: {} })).rejects.toMatchObject({ extensions: { code: 'NOT_FOUND' } });
      const r: any = await Review.create({ rating: 1 });
      await expect(mutations.updateReview(null, { id: r.id, input: { rating: 9 } })).rejects.toThrow('Validation failed');
      expect((await mutations.updateReview(null, { id: r.id, input: { rating: 4 } }) as any).rating).toBe(4);
    });`,
    { db: true },
  );
});

test('m08: requireUser, the email rule and the order of checks', async () => {
  await check(
    `import { GraphQLError } from 'graphql';
    type Context = any;
    ${shown('m08-context-auth-errors/l1-context-auth.md', 'export function requireUser(ctx: Context)')}
    export const fields = {
      ${shown('m08-context-auth-errors/l1-context-auth.md', 'User: {\n  email: (user, _args, ctx) =>')}
    };
    const notFound = (what: string) => new GraphQLError(what, { extensions: { code: 'NOT_FOUND' } });
    export const calls: string[] = [];
    const Issue = { findById: async (id: string) => (id === 'i1' ? { project: 'p1' } : null) };
    const assertCanWriteProject = async (user: any) => {
      if (user.role !== 'ADMIN') throw new GraphQLError('no', { extensions: { code: 'FORBIDDEN' } });
    };
    const updateIssue = async (id: string, input: any) => ({ id, ...input });
    export const mutations = {
      ${shown('m08-context-auth-errors/l2-errors.md', 'updateIssue: async (_p, { id, input }, ctx) => {')}
    };`,
    `import { requireUser, fields, mutations } from '../example';
    const email = (user: any, currentUser: any) => (fields.User.email as any)(user, {}, { currentUser });
    test('requireUser', () => {
      expect(() => requireUser({})).toThrow('You must be logged in');
      expect(requireUser({ currentUser: { id: 1 } })).toEqual({ id: 1 });
    });
    test('only you and admins read an email', () => {
      const ada = { _id: 'a', email: 'a@x' };
      expect(email(ada, null)).toBe(null);
      expect(email(ada, { _id: 'b' })).toBe(null);
      expect(email(ada, { _id: 'a' })).toBe('a@x');
      expect(email(ada, { _id: 'b', role: 'ADMIN' })).toBe('a@x');
    });
    test('who, exists, allowed, then do it', async () => {
      const code = (p: Promise<unknown>) => p.catch((e: any) => e.extensions.code);
      const up = mutations.updateIssue as any;
      expect(await code(up(null, { id: 'nope', input: {} }, {}))).toBe('UNAUTHENTICATED');
      expect(await code(up(null, { id: 'nope', input: {} }, { currentUser: { role: 'MEMBER' } }))).toBe('NOT_FOUND');
      expect(await code(up(null, { id: 'i1', input: {} }, { currentUser: { role: 'MEMBER' } }))).toBe('FORBIDDEN');
      expect(await up(null, { id: 'i1', input: { title: 't' } }, { currentUser: { role: 'ADMIN' } })).toEqual({ id: 'i1', title: 't' });
    });`,
  );
});

test('m09: both DataLoaders keep length and order, with one query', async () => {
  const lesson = 'm09-scaling/l1-n-plus-one.md';
  await check(
    `import mongoose, { Schema } from 'mongoose';
    export const User = mongoose.model('User', new Schema({ name: String }));
    export const Comment = mongoose.model('Comment', new Schema({ issue: Schema.Types.ObjectId }));
    ${shown(lesson, "import DataLoader from 'dataloader';", '// in resolvers:').replace('const userById', 'export const userById')}
    ${shown(lesson, 'const commentCountByIssue = new DataLoader').replace('const commentCountByIssue', 'export const commentCountByIssue')}`,
    `${CLEAN}
    import mongoose from 'mongoose';
    import { countQueries } from '@forge/kit';
    import { User, Comment, userById, commentCountByIssue } from '../example';
    test('users', async () => {
      const [a, b] = await User.create([{ name: 'Ada' }, { name: 'Linus' }]);
      const ghost = String(new mongoose.Types.ObjectId());
      const { result, count } = await countQueries(() => Promise.all([b.id, ghost, a.id].map((id) => userById.load(id))));
      expect(count).toBe(1);
      expect(result.map((u: any) => u?.name ?? null)).toEqual(['Linus', null, 'Ada']);
    });
    test('counts default to 0', async () => {
      const [i1, i2] = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
      await Comment.create([{ issue: i1 }, { issue: i1 }]);
      expect(await commentCountByIssue.loadMany([String(i2), String(i1)])).toEqual([0, 2]);
    });`,
    { db: true },
  );
});

test('m09: the keyset rule, cursors and hasNextPage all hold on ties', async () => {
  const lesson = 'm09-scaling/l2-pagination.md';
  await check(
    `import mongoose, { Schema } from 'mongoose';
    import { GraphQLError } from 'graphql';
    const badInput = (m: string) => new GraphQLError(m, { extensions: { code: 'BAD_USER_INPUT' } });
    export const Issue = mongoose.model('Issue', new Schema({ createdAt: Date, title: String }));
    const after = (C: Date, I: any) => (
      ${shown(lesson, '// sorted by createdAt desc, _id desc (tiebreaker!)').replace(/,\n$/, '\n')}
    );
    ${shown(lesson, 'const encodeCursor = (doc) =>').replace('const encodeCursor', 'export const encodeCursor').replace('function decodeCursor', 'export function decodeCursor')}
    export async function pageAfter(cursor: string | null, first: number) {
      const c = cursor ? decodeCursor(cursor) : null;
      const filter = c ? after(c.createdAt, c.id) : {};
      ${shown(lesson, 'const docs = await Issue.find(filter)')}
      return { page, hasNextPage };
    }`,
    `${CLEAN}
    import { Issue, encodeCursor, decodeCursor, pageAfter } from '../example';
    test('every row exactly once, even when timestamps tie', async () => {
      const when = new Date(Date.UTC(2026, 0, 1));
      await Issue.create([...Array(7)].map((_, i) => ({ title: 'i' + i, createdAt: i < 5 ? when : new Date(when.getTime() + 1000) })));
      const seen: string[] = [];
      let cursor: string | null = null;
      for (;;) {
        const { page, hasNextPage }: any = await pageAfter(cursor, 3);
        seen.push(...page.map((d: any) => d.title));
        if (!hasNextPage) break;
        cursor = encodeCursor(page[page.length - 1]);
      }
      expect(new Set(seen).size).toBe(7);
      expect(seen).toHaveLength(7);
    });
    test('a bad cursor is the client\\'s fault', () => {
      expect(() => decodeCursor('garbage')).toThrow('Invalid cursor');
      const notTime = Buffer.from(JSON.stringify(['x', 'y'])).toString('base64url');
      expect(() => decodeCursor(notTime)).toThrow('Invalid cursor');
    });`,
    { db: true },
  );
});

test('m09: __resolveType maps documents and falls through to null', async () => {
  await check(
    `class Issue {} class Project {} class User {}
    export { Issue, Project, User };
    export const types = {
      ${shown('m09-scaling/l3-architecture.md', 'SearchResult: {\n  __resolveType(obj) {')}
    };`,
    `import { Issue, Project, User, types } from '../example';
    test('each class gets its name', () => {
      const t = types.SearchResult.__resolveType as any;
      expect([t(new Issue()), t(new Project()), t(new User()), t({})]).toEqual(['Issue', 'Project', 'User', null]);
    });`,
  );
});

test('m10: BookList shows loading, data, empty and error', async () => {
  const list = shown('m10-apollo-client/l1-apollo-client.md', "import { gql } from '@apollo/client';");
  await check(
    `import React from 'react';
    ${list.replace('function BookList', 'export function BookList').replace('const BOOKS', 'export const BOOKS')}`,
    `import React from 'react';
    import { render, screen } from '@testing-library/react';
    import { MockedProvider } from '@apollo/client/testing/react';
    import { BOOKS, BookList } from '../example';
    const request = { query: BOOKS, variables: { tag: 'scifi' } };
    const show = (mock: any) => render(<MockedProvider mocks={[mock]}><BookList tag="scifi" /></MockedProvider>);
    test('loading, then the list', async () => {
      show({ request, result: { data: { books: [{ __typename: 'Book', id: '1', title: 'Dune', year: 1965 }] } } });
      expect(screen.getByText('Loading books…')).toBeTruthy();
      expect(await screen.findByText('Dune (1965)')).toBeTruthy();
    });
    test('empty', async () => {
      show({ request, result: { data: { books: [] } } });
      expect(await screen.findByText('No books yet.')).toBeTruthy();
    });
    test('error', async () => {
      show({ request, error: new Error('boom') });
      expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't load books/);
    });`,
    { dom: true },
  );
});

test('m11: keyFields and identify agree with the lesson', async () => {
  await check(
    `import { InMemoryCache } from '@apollo/client';
    export const cache = ${shown('m11-mutations-cache/l1-normalized-cache.md', 'new InMemoryCache({\n  typePolicies: {').trim().replace(/;$/, '')};`,
    `import { cache } from '../example';
    test('a custom key', () => {
      expect(cache.identify({ __typename: 'Product', sku: 'A1' })).toBe('Product:{"sku":"A1"}');
      expect(cache.identify({ __typename: 'Issue', id: 'i1' })).toBe('Issue:i1');
      expect(cache.identify({ __typename: 'PageInfo', endCursor: 'x' })).toBeUndefined();
    });`,
  );
});

test('m11: AddBookForm clears on success and shows an error', async () => {
  await check(
    `import React, { useState } from 'react';
    ${shown('m11-mutations-cache/l2-cache-updates.md', "import { gql } from '@apollo/client';").replace('function AddBookForm', 'export function AddBookForm').replace('const ADD_BOOK', 'export const ADD_BOOK')}`,
    `import React from 'react';
    import { render, screen, waitFor } from '@testing-library/react';
    import userEvent from '@testing-library/user-event';
    import { MockedProvider } from '@apollo/client/testing/react';
    import { ADD_BOOK, AddBookForm } from '../example';
    const request = { query: ADD_BOOK, variables: { input: { title: 'Dune', year: 2026 } } };
    async function submit(mock: any) {
      render(<MockedProvider mocks={[mock]}><AddBookForm /></MockedProvider>);
      await userEvent.type(screen.getByLabelText('Title'), 'Dune');
      await userEvent.click(screen.getByRole('button', { name: 'Add book' }));
    }
    test('success', async () => {
      await submit({ request, result: { data: { addBook: { __typename: 'Book', id: '1', title: 'Dune', year: 2026 } } } });
      await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(''));
    });
    test('failure keeps the title', async () => {
      await submit({ request, error: new Error('nope') });
      expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't add the book/);
      expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Dune');
    });`,
    { dom: true },
  );
});

test('m11: both manual cache updates change what a reader sees', async () => {
  const lesson = 'm11-mutations-cache/l2-cache-updates.md';
  await check(
    `import { gql } from '@apollo/client';
    export const BOOKS = gql\`query Books($tag: String) { books(tag: $tag) { id title } }\`;
    const useMutation = (_m: unknown, options: any) => options;
    const ADD_BOOK = null;
    export const options = ${shown(lesson, 'useMutation(ADD_BOOK, {\n  update(cache, { data }) {').trim().replace(/;$/, '')};
    export const forAuthor = (authorId: string) => ({
      ${shown(lesson, 'update(cache, { data }) {\n  cache.modify({')}
    });`,
    `import { InMemoryCache, gql } from '@apollo/client';
    import { BOOKS, options, forAuthor } from '../example';
    const book = { __typename: 'Book', id: 'b2', title: 'New' };
    test('updateQuery puts the new book first', () => {
      const cache = new InMemoryCache();
      cache.writeQuery({ query: BOOKS, variables: { tag: undefined }, data: { books: [{ __typename: 'Book', id: 'b1', title: 'Old' }] } });
      options.update(cache, { data: { addBook: book } });
      expect((cache.readQuery({ query: BOOKS, variables: { tag: undefined } }) as any).books.map((b: any) => b.id)).toEqual(['b2', 'b1']);
    });
    test('modify appends a reference and bumps the count', () => {
      const AUTHOR = gql\`query { author(id: "a7") { id bookCount books { id title } } }\`;
      const cache = new InMemoryCache();
      const data = { author: { __typename: 'Author', id: 'a7', bookCount: 1, books: [{ __typename: 'Book', id: 'b1', title: 'Old' }] } };
      cache.writeQuery({ query: AUTHOR, data });
      cache.writeFragment({ id: 'Book:b2', fragment: gql\`fragment B on Book { id title }\`, data: book });
      forAuthor('a7').update(cache, { data: { addBook: book } });
      const out: any = cache.readQuery({ query: AUTHOR });
      expect(out.author.bookCount).toBe(2);
      expect(out.author.books.map((b: any) => b.id)).toEqual(['b1', 'b2']);
    });`,
  );
});

test('m12: the offset merge writes each page at its position', async () => {
  await check(
    `export const types = {
      ${shown('m12-fragments-pagination/l2-client-pagination.md', 'Project: {\n  fields: {\n    issues: {')}
    };`,
    `import { types } from '../example';
    const { merge, keyArgs } = types.Project.fields.issues as any;
    test('two pages and a re-fetched page', () => {
      expect(keyArgs).toEqual(['filter', 'sort']);
      const one = merge(undefined, ['a', 'b'], { args: { offset: 0 } });
      const two = merge(one, ['c'], { args: { offset: 2 } });
      expect(two).toEqual(['a', 'b', 'c']);
      expect(merge(two, ['A'], { args: { offset: 0 } })).toEqual(['A', 'b', 'c']);
      expect(two).toEqual(['a', 'b', 'c']);
    });`,
  );
});
