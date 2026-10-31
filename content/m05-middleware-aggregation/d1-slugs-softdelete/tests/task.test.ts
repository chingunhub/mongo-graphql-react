import { expect } from 'expect';
import { resetDb } from '@forge/kit';
import { Article } from '../models/Article';

const A = Article as any;
beforeEach(resetDb);

test('new articles get a slug from their title', async () => {
  const a: any = await Article.create({ title: 'Why Mongo Indexes Matter!' });
  expect(a.slug).toBe('why-mongo-indexes-matter');
});

test('editing only the body keeps the slug', async () => {
  const a: any = await Article.create({ title: 'Original title' });
  await Article.collection.updateOne({ _id: a._id }, { $set: { slug: 'custom-slug' } });
  const fresh: any = await Article.findById(a._id);
  fresh.body = 'new body';
  await fresh.save();
  expect((await Article.findById(a._id).lean())!.slug).toBe('custom-slug');
}, { hint: 'Only recompute when this.isModified("title").' });

test('changing the title updates the slug', async () => {
  const a: any = await Article.create({ title: 'First' });
  a.title = 'Second Title';
  await a.save();
  expect(a.slug).toBe('second-title');
});

test('softDelete hides the article from find, findOne, findById and countDocuments', async () => {
  const a: any = await Article.create({ title: 'Gone soon' });
  await Article.create({ title: 'Stays' });
  const res = await a.softDelete();
  expect(res.deletedAt).toBeInstanceOf(Date);
  expect((await Article.find()).map((x: any) => x.title)).toEqual(['Stays']);
  expect(await Article.findOne({ title: 'Gone soon' })).toBeNull();
  expect(await Article.findById(a._id)).toBeNull();
  expect(await Article.countDocuments()).toBe(1);
}, { hint: "countDocuments is not matched by /^find/ — register both: pre(['countDocuments', /^find/], ...)" });

test('findOneAndUpdate does not touch soft-deleted articles', async () => {
  const a: any = await Article.create({ title: 'Gone' });
  await a.softDelete();
  const res = await Article.findOneAndUpdate({ _id: a._id }, { $set: { body: 'x' } }, { returnDocument: 'after' });
  expect(res).toBeNull();
});

test('setOptions({ withDeleted: true }) sees everything', async () => {
  const a: any = await Article.create({ title: 'Gone' });
  await Article.create({ title: 'Stays' });
  await a.softDelete();
  expect(await Article.find().setOptions({ withDeleted: true })).toHaveLength(2);
  expect(await Article.countDocuments().setOptions({ withDeleted: true })).toBe(2);
  expect(await Article.findById(a._id).setOptions({ withDeleted: true })).not.toBeNull();
}, { hint: 'this.getOptions().withDeleted inside the query hook.' });

test('restore brings it back', async () => {
  const a: any = await Article.create({ title: 'Back again' });
  await a.softDelete();
  const deleted: any = await Article.findById(a._id).setOptions({ withDeleted: true });
  const restored = await deleted.restore();
  expect(restored.deletedAt).toBeNull();
  expect(await Article.findById(a._id)).not.toBeNull();
});

test('findBySlug is a static that respects soft delete', async () => {
  expect(typeof A.findBySlug).toBe('function');
  const a: any = await Article.create({ title: 'Hello World' });
  expect((await A.findBySlug('hello-world'))?.title).toBe('Hello World');
  await a.softDelete();
  expect(await A.findBySlug('hello-world')).toBeNull();
  expect(await A.findBySlug('nope')).toBeNull();
});
