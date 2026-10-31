import { User } from './server/models/User';
import { Project } from './server/models/Project';
import { Issue } from './server/models/Issue';
import { nextSequence } from './server/models/Counter';
import { projectStats, workload } from './server/services/stats';

console.log(await nextSequence('demo'), await nextSequence('demo'), await nextSequence('other'));

const ada = await User.create({ name: 'Ada', email: 'ada@taskforge.dev' });
const tf = await Project.create({ name: 'Taskforge', key: 'TF', owner: ada._id });
const I = Issue as any;

const created = await Promise.all(
  ['Set up CI', 'Login page', 'Dark mode'].map((title) =>
    I.createInProject?.(String(tf._id), { title, reporter: ada._id, assignee: ada._id }),
  ),
);
console.log(created.map((i: any) => i && `TF-${i.number} ${i.title}`));

console.log(await projectStats(String(tf._id)));
console.log(await workload(String(tf._id)));
