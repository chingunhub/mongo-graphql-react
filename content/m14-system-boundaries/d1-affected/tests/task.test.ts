import { expect } from 'expect';
import { affected } from '../affected';
test(
  'follows consumers, not dependencies',
  () =>
    expect(affected({ web: ['api'], api: ['types'], types: [], other: ['types'] }, ['api'])).toEqual(['api', 'web']),
  { hint: 'Reverse the dependency direction when finding change impact.' },
);
test('shared contract affects both branches once', () =>
  expect(affected({ a: ['b', 'c'], b: ['d'], c: ['d'], d: [] }, ['d', 'd'])).toEqual(['a', 'b', 'c', 'd']));
test('cycles terminate and unrelated projects stay out', () =>
  expect(affected({ a: ['b'], b: ['a'], c: [] }, ['a'])).toEqual(['a', 'b']));
test('empty changes and immutable inputs', () => {
  const graph = { a: [], b: ['a'] };
  const before = JSON.stringify(graph);
  expect(affected(graph, [])).toEqual([]);
  expect(JSON.stringify(graph)).toBe(before);
});
test('unknown changed project fails', () => expect(() => affected({ a: [] }, ['typo'])).toThrow('Unknown project'));
test('unknown disconnected dependency fails', () =>
  expect(() => affected({ a: [], b: ['missing'] }, ['a'])).toThrow('Unknown project'));
