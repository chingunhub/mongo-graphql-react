import { expect } from 'expect';
import { toBoard, type Issue } from '../board';

const mk = (id: string, status: Issue['status'], priority: Issue['priority']): Issue => ({
  id,
  title: 'Issue ' + id,
  status,
  priority,
});

test('returns the four columns in board order', () => {
  const board = toBoard([mk('1', 'DONE', 'LOW')]);
  expect(Object.keys(board)).toEqual(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']);
}, { hint: 'Create the result object with all four keys up front, in this order.' });

test('empty columns are empty arrays', () => {
  const board = toBoard([]);
  expect(board).toEqual({ TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] });
});

test('puts each issue in its status column', () => {
  const board = toBoard([mk('1', 'TODO', 'LOW'), mk('2', 'DONE', 'LOW'), mk('3', 'TODO', 'LOW')]);
  expect(board.TODO.map((i) => i.id)).toEqual(['1', '3']);
  expect(board.DONE.map((i) => i.id)).toEqual(['2']);
});

test('sorts each column most urgent first', () => {
  const board = toBoard([
    mk('a', 'TODO', 'LOW'),
    mk('b', 'TODO', 'URGENT'),
    mk('c', 'TODO', 'MEDIUM'),
    mk('d', 'TODO', 'HIGH'),
  ]);
  expect(board.TODO.map((i) => i.priority)).toEqual(['URGENT', 'HIGH', 'MEDIUM', 'LOW']);
}, { hint: "Alphabetical order would give HIGH, LOW, MEDIUM, URGENT. Map priorities to numbers." });

test('equal priorities keep their original order', () => {
  const board = toBoard([mk('1', 'TODO', 'HIGH'), mk('2', 'TODO', 'LOW'), mk('3', 'TODO', 'HIGH'), mk('4', 'TODO', 'HIGH')]);
  expect(board.TODO.map((i) => i.id)).toEqual(['1', '3', '4', '2']);
});

test('does not mutate the input array', () => {
  const input = [mk('1', 'TODO', 'LOW'), mk('2', 'TODO', 'URGENT')];
  const copy = [...input];
  toBoard(input);
  expect(input).toEqual(copy);
  expect(input[0].id).toBe('1');
}, { hint: 'Sort the column arrays you created, not the array you were given.' });
