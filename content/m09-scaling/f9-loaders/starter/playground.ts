import mongoose from 'mongoose';
import { createApolloServer } from './server/graphql/server';
import { buildContext } from './server/graphql/context';
import { User } from './server/models/User';
import { Project } from './server/models/Project';
import { Issue } from './server/models/Issue';
import { Comment } from './server/models/Comment';

// Seed a board: 4 people, 20 issues, some comments.
const people = await User.create(['Ada', 'Grace', 'Linus', 'Margaret'].map((name) => ({ name, email: `${name.toLowerCase()}@taskforge.dev` })));
const tf = await Project.create({ name: 'Taskforge', key: 'TF', owner: people[0]._id, members: people.map((p) => p._id) });
for (let i = 0; i < 20; i++) {
  const issue = await (Issue as any).createInProject(String(tf._id), {
    title: `Issue number ${i + 1}`,
    reporter: people[i % 4]._id,
    assignee: i % 3 ? people[(i + 1) % 4]._id : null,
  });
  if (i % 2) await Comment.create({ issue: issue._id, author: people[(i + 2) % 4]._id, body: 'Looks good' });
}

let queries = 0;
mongoose.set('debug', () => queries++);

const server = createApolloServer();
const res: any = await server.executeOperation(
  {
    query: `{ project(key: "TF") {
      owner { name } members { name }
      issues(limit: 20) { key reporter { name } assignee { name } commentCount comments { author { name } } }
    } }`,
  },
  { contextValue: await buildContext({ req: { headers: {} } }) },
);
mongoose.set('debug', false);
console.log('errors:', res.body.singleResult.errors ?? 'none');
console.log('first issue:', JSON.stringify(res.body.singleResult.data?.project?.issues?.[1]));
console.log('database queries:', queries);
