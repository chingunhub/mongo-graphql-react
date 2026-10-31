import { expect } from 'expect';
import { resetDb, execute } from '@forge/kit';
import { createServer } from '../server';
import { buildContext } from '../context';
import { formatError } from '../errors';
import { User } from '../models/User';
import { Expense } from '../models/Expense';

const server = createServer();
const SAM = 'Bearer token-sam';
const KAI = 'Bearer token-kai';
let sam: any, kai: any, lunch: any, taxi: any;

async function as(authorization: string | undefined, query: string, variables?: Record<string, unknown>) {
  const ctx = await buildContext({ req: { headers: { authorization } } });
  return execute(server, query, variables, ctx) as Promise<any>;
}
const code = (r: any) => r.errors?.[0]?.extensions?.code;
const UPDATE = 'mutation ($id: ID!, $title: String!) { updateExpense(id: $id, title: $title) { id title } }';
const DELETE = 'mutation ($id: ID!) { deleteExpense(id: $id) }';

beforeEach(async () => {
  await resetDb();
  [sam, kai] = await User.create([
    { name: 'Sam', token: 'token-sam' },
    { name: 'Kai', token: 'token-kai' },
  ]);
  lunch = await Expense.create({ title: 'Team lunch', amountCents: 8400, owner: sam._id });
  taxi = await Expense.create({ title: 'Airport taxi', amountCents: 5200, owner: kai._id });
});

test('a token identifies its owner', async () => {
  const r = await as(SAM, '{ me { name } myExpenses { title } }');
  expect(r.errors).toBeUndefined();
  expect(r.data).toEqual({ me: { name: 'Sam' }, myExpenses: [{ title: 'Team lunch' }] });
});

test('symptom 1: no token after someone else used the app means anonymous', async () => {
  await as(SAM, '{ me { name } }');
  const r = await as(undefined, '{ me { name } }');
  expect(r.data.me).toBeNull();
}, { hint: 'A variable at the top of a module lives as long as the server, across every request and every person. The current user belongs to one request.' });

test('symptom 1: a logged-out visitor cannot read anyone\'s expenses', async () => {
  await as(SAM, '{ me { name } }');
  const r = await as(undefined, '{ myExpenses { title } }');
  expect(code(r)).toBe('UNAUTHENTICATED');
});

test('symptom 1: a token nobody owns is anonymous, and never the previous person', async () => {
  await as(SAM, '{ me { name } }');
  const r = await as('Bearer forged', '{ me { name } }');
  expect(r.data.me).toBeNull();
});

test('symptom 1: two people in a row each see only themselves', async () => {
  expect((await as(SAM, '{ me { name } }')).data.me.name).toBe('Sam');
  expect((await as(KAI, '{ me { name } }')).data.me.name).toBe('Kai');
  expect((await as(SAM, '{ myExpenses { title } }')).data.myExpenses).toEqual([{ title: 'Team lunch' }]);
});

test('symptom 2: an owner can update their own expense', async () => {
  const r = await as(SAM, UPDATE, { id: String(lunch._id), title: 'Team dinner' });
  expect(r.errors).toBeUndefined();
  expect(r.data.updateExpense).toEqual({ id: String(lunch._id), title: 'Team dinner' });
  expect((await Expense.findById(lunch._id).lean())?.title).toBe('Team dinner');
}, { hint: '`!==` on two ObjectId objects compares object identity, not their value. Two separate objects are never identical, even with the same bytes inside.' });

test('symptom 2: someone else still gets FORBIDDEN and changes nothing', async () => {
  const r = await as(KAI, UPDATE, { id: String(lunch._id), title: 'Stolen' });
  expect(code(r)).toBe('FORBIDDEN');
  expect((await Expense.findById(lunch._id).lean())?.title).toBe('Team lunch');
}, { hint: 'Removing the check makes the owner case pass and opens the door for everybody else. Fix the comparison instead.' });

test('symptom 3: an owner can delete their own expense', async () => {
  const r = await as(KAI, DELETE, { id: String(taxi._id) });
  expect(r.errors).toBeUndefined();
  expect(r.data.deleteExpense).toBe(String(taxi._id));
  expect(await Expense.countDocuments()).toBe(1);
});

test('symptom 3: nobody else can', async () => {
  const r = await as(SAM, DELETE, { id: String(taxi._id) });
  expect(code(r)).toBe('FORBIDDEN');
  expect(await Expense.countDocuments()).toBe(2);
}, { hint: 'requireUser answers "who are you?". Nothing here answers "is this yours?".' });

test('logged-out writes are UNAUTHENTICATED, not FORBIDDEN', async () => {
  await as(SAM, '{ me { name } }');
  expect(code(await as(undefined, DELETE, { id: String(taxi._id) }))).toBe('UNAUTHENTICATED');
  expect(code(await as(undefined, UPDATE, { id: String(taxi._id), title: 'x' }))).toBe('UNAUTHENTICATED');
  expect(await Expense.countDocuments()).toBe(2);
});

test('symptom 4: a bad id does not show a database message to the client', async () => {
  const r = await as(SAM, UPDATE, { id: 'abc', title: 'x' });
  expect(r.errors).toHaveLength(1);
  expect(r.errors[0].message).not.toMatch(/cast|objectid/i);
}, { hint: 'The masking code exists, but its `if` never matches. Log the code an unexpected error really has.' });

test('symptom 4: formatError masks unexpected errors', () => {
  const out = formatError({ message: 'connect ECONNREFUSED 10.0.3.12:27017', extensions: { code: 'INTERNAL_SERVER_ERROR', stacktrace: ['secret'] } }, new Error('x'));
  expect(out.message).toBe('Something went wrong');
  expect(out.extensions).toEqual({ code: 'INTERNAL_SERVER_ERROR' });
});

test('symptom 4: errors you threw on purpose keep their code and message', async () => {
  const r = await as(KAI, UPDATE, { id: String(lunch._id), title: 'x' });
  expect(r.errors[0].message).toBe('You cannot change this expense');
  const out = formatError({ message: 'Expense not found', extensions: { code: 'NOT_FOUND' } }, new Error('x'));
  expect(out).toEqual({ message: 'Expense not found', extensions: { code: 'NOT_FOUND' } });
}, { hint: 'Mask only the unexpected ones. If everything becomes "Something went wrong", the client cannot tell FORBIDDEN from a crash.' });
