import { toBoard, type Issue } from './board';

const issues: Issue[] = [
  { id: '1', title: 'Set up CI', status: 'DONE', priority: 'MEDIUM' },
  { id: '2', title: 'Login page', status: 'IN_PROGRESS', priority: 'HIGH' },
  { id: '3', title: 'Fix crash on save', status: 'TODO', priority: 'URGENT' },
  { id: '4', title: 'Write docs', status: 'TODO', priority: 'LOW' },
];

const board = toBoard(issues);
console.log(Object.keys(board));
console.log(board);
