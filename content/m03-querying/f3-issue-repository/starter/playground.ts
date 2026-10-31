import { User } from './server/models/User';
import { Project } from './server/models/Project';
import { Issue } from './server/models/Issue';
import { listIssues, countIssues, updateIssue, addLabel } from './server/repositories/issues';

const ada = await User.create({ name: 'Ada', email: 'ada@taskforge.dev' });
const tf = await Project.create({ name: 'Taskforge', key: 'TF', owner: ada._id });
const pid = String(tf._id);

await Issue.create([
  { project: tf._id, number: 1, title: 'Set up CI', reporter: ada._id, status: 'DONE' },
  { project: tf._id, number: 2, title: 'Login page', reporter: ada._id, assignee: ada._id, priority: 'HIGH' },
  { project: tf._id, number: 3, title: 'Crash on (save)', reporter: ada._id, priority: 'URGENT' },
]);

console.log((await listIssues(pid, { search: '(save' })).map((i: any) => i.title));
console.log('unassigned:', await countIssues(pid, { assigneeId: null }));

const [first]: any[] = await listIssues(pid, {}, { sort: 'OLDEST', limit: 1 });
console.log(await updateIssue(String(first._id), { status: 'IN_PROGRESS', number: 99 } as any));
console.log(await addLabel(String(first._id), { name: 'DevOps', color: '#0ea5e9' }));
