import { User } from './server/models/User';
import { Project } from './server/models/Project';
import { Issue } from './server/models/Issue';
import { addComment } from './server/repositories/comments';
import { getIssueDetail } from './server/repositories/issues';

const ada = await User.create({ name: 'Ada', email: 'ada@taskforge.dev' });
const grace = await User.create({ name: 'Grace', email: 'grace@taskforge.dev' });
const tf = await Project.create({ name: 'Taskforge', key: 'TF', owner: ada._id, members: [ada._id, grace._id] });
const issue = await Issue.create({ project: tf._id, number: 1, title: 'Login page', reporter: ada._id, assignee: grace._id });

await addComment(String(issue._id), String(grace._id), 'On it!');
await addComment(String(issue._id), String(ada._id), 'Thanks — remember the dark mode variant.');

const detail: any = await getIssueDetail(String(issue._id));
console.log(JSON.stringify(detail, null, 2));
console.log(await getIssueDetail('not-an-id'));
