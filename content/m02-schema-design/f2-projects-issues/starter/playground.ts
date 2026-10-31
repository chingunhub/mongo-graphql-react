import { User } from './server/models/User';
import { Project } from './server/models/Project';
import { Issue } from './server/models/Issue';

const ada = await User.create({ name: 'Ada', email: 'ada@taskforge.dev' });
const tf = await Project.create({ name: 'Taskforge', key: ' tf ', owner: ada._id, members: [ada._id] });
console.log(tf.toObject());

const issue = await Issue.create({
  project: tf._id,
  number: 1,
  title: 'Set up CI',
  reporter: ada._id,
  labels: [{ name: 'DevOps', color: '#0ea5e9' }],
});
console.log(issue.toObject());

try {
  await Issue.create({ project: tf._id, number: 2, title: 'x', reporter: ada._id, priority: 'CRITICAL' });
} catch (e) {
  console.log((e as Error).message);
}
