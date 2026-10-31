import mongoose from 'mongoose';
import { createServer } from './server';
import { createContext } from './context';
import { Article } from './models/Article';
import { Author } from './models/Author';
import { Comment } from './models/Comment';

const server = createServer();
const [nell, ida, ernest, joan, oriana] = await Author.create(
  ['Nellie Bly', 'Ida Tarbell', 'Ernest Pyle', 'Joan Didion', 'Oriana Fallaci'].map((name) => ({ name })),
);

// Newest first is Scoop by Oriana, then Exposé by Joan, then Report by Ida.
const report = await Article.create({ title: 'Report', author: ida._id, reviewers: [nell._id], publishedAt: new Date('2026-01-01') });
const expose = await Article.create({ title: 'Exposé', author: joan._id, reviewers: [nell._id, ernest._id, ida._id], publishedAt: new Date('2026-02-01') });
const scoop = await Article.create({ title: 'Scoop', author: oriana._id, reviewers: [joan._id], publishedAt: new Date('2026-03-01') });
await Comment.create([report, expose, scoop].map((article) => ({ article: article._id, body: 'Great' })));

let queries = 0;
mongoose.set('debug', () => queries++);

async function show(label: string) {
  queries = 0;
  const res = await server.executeOperation(
    { query: '{ articles { title author { name } reviewers { name } commentCount } }' },
    { contextValue: createContext() },
  );
  const body = res.body.kind === 'single' ? res.body.singleResult : res.body;
  console.log(label, JSON.stringify(body, null, 2));
  console.log('queries:', queries, '(target: 3)');
}

// Symptoms 1 and 4: everything looks fine, apart from the names and the query count.
await show('Three healthy articles');

// Symptom 2: a freelancer's account is removed, then restored for the next step.
await ernest.deleteOne();
await show('After removing a reviewer');
await Author.create({ _id: ernest._id, name: ernest.name });

// Symptom 3: a brand new article with no comments.
await Article.create({ title: 'Breaking', author: nell._id, reviewers: [], publishedAt: new Date('2026-04-01') });
await show('With a new article');
