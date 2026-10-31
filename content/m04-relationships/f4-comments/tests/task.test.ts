import { expect } from 'expect';
import mongoose from 'mongoose';
import { resetDb, ensureIndexes, countQueries } from '@forge/kit';
import { User } from '../server/models/User';
import { Project } from '../server/models/Project';
import { Issue } from '../server/models/Issue';
import { Comment } from '../server/models/Comment';
import { addComment, listComments } from '../server/repositories/comments';
import * as issuesRepo from '../server/repositories/issues';

// getIssueDetail is added to an existing file, so don't fail the whole suite if it's missing yet.
const getIssueDetail = (id: string) => {
  const fn = (issuesRepo as any).getIssueDetail;
  if (typeof fn !== 'function') throw new Error('server/repositories/issues.ts does not export getIssueDetail yet');
  return fn(id);
};

let ada: any, grace: any, tf: any, issue: any;

beforeAll(async () => {
  await ensureIndexes(User, Project, Issue, Comment);
});

beforeEach(async () => {
  await resetDb();
  ada = await User.create({ name: 'Ada', email: 'ada@taskforge.dev' });
  grace = await User.create({ name: 'Grace', email: 'grace@taskforge.dev' });
  tf = await Project.create({ name: 'Taskforge', key: 'TF', owner: ada._id });
  issue = await Issue.create({ project: tf._id, number: 1, title: 'Login page', reporter: ada._id, assignee: grace._id });
});

const at = (min: number) => new Date(Date.UTC(2026, 0, 1, 0, min));

describe('Comment model', () => {
  test('requires issue, author and a body of at most 2000 characters', async () => {
    await expect(Comment.create({ author: ada._id, body: 'x' })).rejects.toThrow(/issue/);
    await expect(Comment.create({ issue: issue._id, body: 'x' })).rejects.toThrow(/author/);
    await expect(Comment.create({ issue: issue._id, author: ada._id, body: '   ' })).rejects.toThrow(/body/);
    await expect(Comment.create({ issue: issue._id, author: ada._id, body: 'x'.repeat(2001) })).rejects.toThrow(/body/);
    const c: any = await Comment.create({ issue: issue._id, author: ada._id, body: '  hi  ' });
    expect(c.body).toBe('hi');
    expect(c.createdAt).toBeInstanceOf(Date);
  });

  test('references Issue and User', () => {
    expect((Comment.schema.path('issue') as any).options.ref).toBe('Issue');
    expect((Comment.schema.path('author') as any).options.ref).toBe('User');
  });

  test('has an index on { issue: 1, createdAt: 1 }', () => {
    const keys = Comment.schema.indexes().map(([k]) => JSON.stringify(k));
    expect(keys).toContain(JSON.stringify({ issue: 1, createdAt: 1 }));
  }, { hint: 'commentSchema.index({ issue: 1, createdAt: 1 })' });
});

describe('Issue virtuals', () => {
  test('comments are oldest first; commentCount counts them', async () => {
    await Comment.create([
      { issue: issue._id, author: ada._id, body: 'second', createdAt: at(2) },
      { issue: issue._id, author: grace._id, body: 'first', createdAt: at(1) },
    ]);
    const i: any = await Issue.findById(issue._id).populate('comments').populate('commentCount');
    expect(i.comments.map((c: any) => c.body)).toEqual(['first', 'second']);
    expect(i.commentCount).toBe(2);
  }, { hint: "Virtual: ref 'Comment', localField '_id', foreignField 'issue'." });

  test('virtuals appear in toJSON', async () => {
    const i: any = await Issue.findById(issue._id).populate('commentCount');
    expect(i.toJSON().commentCount).toBe(0);
    expect(i.toJSON().id).toBe(String(issue._id));
  });
});

describe('repositories/comments', () => {
  test('addComment creates a comment with the author populated', async () => {
    const c: any = await addComment(String(issue._id), String(grace._id), 'On it!');
    expect(c.body).toBe('On it!');
    expect(c.author.name).toBe('Grace');
    expect(c.author.email).toBeUndefined();
    expect(await Comment.countDocuments({ issue: issue._id })).toBe(1);
  });

  test('addComment on a missing issue resolves to null and creates nothing', async () => {
    expect(await addComment(String(new mongoose.Types.ObjectId()), String(ada._id), 'hello?')).toBeNull();
    expect(await Comment.countDocuments()).toBe(0);
  });

  test('listComments: this issue only, oldest first, author names', async () => {
    const other = await Issue.create({ project: tf._id, number: 2, title: 'Other issue', reporter: ada._id });
    await Comment.create([
      { issue: issue._id, author: ada._id, body: 'b', createdAt: at(5) },
      { issue: other._id, author: ada._id, body: 'elsewhere', createdAt: at(1) },
      { issue: issue._id, author: grace._id, body: 'a', createdAt: at(3) },
    ]);
    const list: any[] = await listComments(String(issue._id));
    expect(list.map((c) => [c.body, c.author.name])).toEqual([
      ['a', 'Grace'],
      ['b', 'Ada'],
    ]);
  });
});

describe('getIssueDetail', () => {
  test('loads project, people, comments with authors, and the count', async () => {
    await Comment.create([
      { issue: issue._id, author: grace._id, body: 'On it!', createdAt: at(1) },
      { issue: issue._id, author: ada._id, body: 'Thanks', createdAt: at(2) },
    ]);
    const d: any = await getIssueDetail(String(issue._id));
    expect(d.project.key).toBe('TF');
    expect(d.project.name).toBe('Taskforge');
    expect(d.reporter.name).toBe('Ada');
    expect(d.reporter.email).toBe('ada@taskforge.dev');
    expect(d.assignee.name).toBe('Grace');
    expect(d.comments.map((c: any) => [c.body, c.author.name])).toEqual([
      ['On it!', 'Grace'],
      ['Thanks', 'Ada'],
    ]);
    expect(d.commentCount).toBe(2);
  }, { hint: "Chain several .populate() calls; nest one for comments' authors." });

  test('populated people carry only the selected fields', async () => {
    const d: any = await getIssueDetail(String(issue._id));
    expect(d.reporter.role).toBeUndefined();
    expect(d.project.owner).toBeUndefined();
  });

  test('unassigned issues have assignee null', async () => {
    const lone = await Issue.create({ project: tf._id, number: 3, title: 'Unassigned', reporter: ada._id });
    const d: any = await getIssueDetail(String(lone._id));
    expect(d.assignee).toBeNull();
    expect([...d.comments]).toEqual([]);
    expect(d.commentCount).toBe(0);
  });

  test('unknown and malformed ids resolve to null (no CastError)', async () => {
    expect(await getIssueDetail(String(new mongoose.Types.ObjectId()))).toBeNull();
    expect(await getIssueDetail('not-an-id')).toBeNull();
  }, { hint: 'mongoose.isValidObjectId(id)' });

  test('query count does not grow with the number of comments', async () => {
    const people = await User.create(
      Array.from({ length: 12 }, (_, i) => ({ name: 'P' + i, email: `p${i}@taskforge.dev` })),
    );
    const small = await countQueries(() => getIssueDetail(String(issue._id)));
    await Comment.create(people.map((p: any, i) => ({ issue: issue._id, author: p._id, body: 'c' + i, createdAt: at(i) })));
    const big = await countQueries(() => getIssueDetail(String(issue._id)));
    expect((big.result as any).comments).toHaveLength(12);
    expect(big.count).toBeLessThanOrEqual(small.count + 1);
  }, { hint: 'Nested populate batches comment authors into one query. Loops do not.' });
});

describe('details that are easy to get right by accident', () => {
  // The index returns comments in time order for free. Take it away and only a real sort still works.
  async function withoutCommentIndex(run: () => Promise<void>) {
    await Comment.collection.dropIndexes();
    try {
      await run();
    } finally {
      await Comment.syncIndexes();
    }
  }
  const twoComments = async () => {
    await Comment.create({ issue: issue._id, author: ada._id, body: 'second', createdAt: at(2) });
    await Comment.create({ issue: issue._id, author: grace._id, body: 'first', createdAt: at(1) });
  };

  test('listComments sorts by time even without the index', () =>
    withoutCommentIndex(async () => {
      await twoComments();
      expect((await listComments(String(issue._id))).map((c: any) => c.body)).toEqual(['first', 'second']);
    }), { hint: 'Sort in the query: the index only makes the sort cheap.' });

  test('the comments virtual sorts by time even without the index', () =>
    withoutCommentIndex(async () => {
      await twoComments();
      const i: any = await Issue.findById(issue._id).populate('comments');
      expect(i.comments.map((c: any) => c.body)).toEqual(['first', 'second']);
    }), { hint: 'The virtual takes options: { sort: { createdAt: 1 } }.' });

  test('listComments shares the author name and nothing else', async () => {
    await twoComments();
    const [c]: any[] = await listComments(String(issue._id));
    expect(c.author.name).toBeTruthy();
    expect(c.author.email).toBeUndefined();
  }, { hint: 'populate can select just the fields a caller needs.' });

  test('getIssueDetail shares comment authors by name only', async () => {
    await twoComments();
    const d: any = await getIssueDetail(String(issue._id));
    expect(d.comments[0].author.name).toBeTruthy();
    expect(d.comments[0].author.email).toBeUndefined();
  }, { hint: 'A nested populate can have its own select.' });
});
