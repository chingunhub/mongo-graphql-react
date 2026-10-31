import { expect } from 'expect';
import mongoose from 'mongoose';
import { resetDb } from '@forge/kit';
import { Author } from '../models/Author';
import { Post } from '../models/Post';
import { getPost, getAuthorPage, latestPosts } from '../repositories/blog';

let sam: any, kai: any, posts: any[];

beforeEach(async () => {
  await resetDb();
  sam = await Author.create({ name: 'Sam', email: 'sam@blog.dev', avatar: 'sam.png' });
  kai = await Author.create({ name: 'Kai', email: 'kai@blog.dev' });
  posts = await Post.create([
    { title: 'Hello world', slug: 'hello', author: sam._id, published: true, publishedAt: new Date('2026-01-01') },
    { title: 'Draft ideas', slug: 'draft', author: sam._id },
    { title: 'Mongoose tips', slug: 'tips', author: sam._id, published: true, publishedAt: new Date('2026-03-01') },
    { title: 'Kai writes', slug: 'kai', author: kai._id, published: true, publishedAt: new Date('2026-02-01') },
    { title: 'Kai draft', slug: 'kai-draft', author: kai._id },
  ]);
});

test('Post.author is a required reference to Author', async () => {
  const path: any = Post.schema.path('author');
  expect(path?.options?.ref).toBe('Author');
  await expect(Post.create({ title: 'x', slug: 'x' })).rejects.toThrow(/author/);
});

test('getPost populates author with only name and avatar', async () => {
  const p: any = await getPost(String(posts[0]._id));
  expect(p.author.name).toBe('Sam');
  expect(p.author.avatar).toBe('sam.png');
  expect(p.author.email).toBeUndefined();
}, { hint: "populate({ path: 'author', select: 'name avatar' })" });

test('getPost returns null for an unknown id', async () => {
  expect(await getPost(String(new mongoose.Types.ObjectId()))).toBeNull();
});

test('author.posts: only published, newest first', async () => {
  const a: any = await getAuthorPage(String(sam._id));
  expect(a.posts.map((p: any) => p.title)).toEqual(['Mongoose tips', 'Hello world']);
}, { hint: 'Give the virtual a match: { published: true } and options: { sort: { publishedAt: -1 } }.' });

test('author.posts entries carry only title, slug and publishedAt', async () => {
  const a: any = await getAuthorPage(String(sam._id));
  const post = a.posts[0].toObject ? a.posts[0].toObject() : a.posts[0];
  expect(post.title).toBeDefined();
  expect(post.slug).toBeDefined();
  expect(post.publishedAt).toBeDefined();
  expect(post.body).toBeUndefined();
  expect(post.published).toBeUndefined();
});

test('author.publishedCount is the number of published posts', async () => {
  expect(((await getAuthorPage(String(sam._id))) as any).publishedCount).toBe(2);
  expect(((await getAuthorPage(String(kai._id))) as any).publishedCount).toBe(1);
}, { hint: 'A second virtual with count: true (and the same match).' });

test('an author with no published posts gets [] and 0', async () => {
  const lee = await Author.create({ name: 'Lee', email: 'lee@blog.dev' });
  const a: any = await getAuthorPage(String(lee._id));
  expect([...a.posts]).toEqual([]);
  expect(a.publishedCount).toBe(0);
});

test('virtuals appear in toJSON()', async () => {
  const a: any = await getAuthorPage(String(sam._id));
  const json = a.toJSON();
  expect(json.publishedCount).toBe(2);
  expect(json.posts).toHaveLength(2);
  expect(json.id).toBe(String(sam._id));
}, { hint: 'Schema options: { toJSON: { virtuals: true }, toObject: { virtuals: true } }' });

test('getAuthorPage returns null for an unknown id', async () => {
  expect(await getAuthorPage(String(new mongoose.Types.ObjectId()))).toBeNull();
});

test('latestPosts: published only, newest first, limited', async () => {
  const list: any[] = await latestPosts(2);
  expect(list.map((p) => p.title)).toEqual(['Mongoose tips', 'Kai writes']);
  expect((await latestPosts()).length).toBe(3);
});

test('latestPosts returns plain objects with author { _id, name }', async () => {
  const [p]: any[] = await latestPosts(1);
  expect(p instanceof mongoose.Document).toBe(false);
  expect(Object.keys(p.author).sort()).toEqual(['_id', 'name']);
  expect(p.author.name).toBe('Sam');
});
