import { createServer } from './server';
import { buildContext } from './context';
import { Expense } from './models/Expense';
import { User } from './models/User';

const server = createServer();

// Each call simulates one HTTP request: a new context, like Apollo Server builds.
async function as(authorization: string | undefined, query: string, variables?: Record<string, unknown>) {
  const contextValue = await buildContext({ req: { headers: { authorization } } });
  const res = await server.executeOperation({ query, variables }, { contextValue });
  console.log(`[${authorization ?? 'logged out'}]`, JSON.stringify(res.body.kind === 'single' ? res.body.singleResult : res.body));
}

const [sam, kai] = await User.create([
  { name: 'Sam', token: 'token-sam' },
  { name: 'Kai', token: 'token-kai' },
]);
const lunch = await Expense.create({ title: 'Team lunch', amountCents: 8400, owner: sam._id });
const taxi = await Expense.create({ title: 'Airport taxi', amountCents: 5200, owner: kai._id });

// Symptom 1: Sam uses the app, then someone arrives with no token.
await as('Bearer token-sam', '{ me { name } myExpenses { title } }');
await as(undefined, '{ me { name } myExpenses { title } }');

// Symptom 2: Sam edits Sam's own expense.
await as('Bearer token-sam', 'mutation ($id: ID!) { updateExpense(id: $id, title: "Team dinner") { title } }', { id: String(lunch._id) });

// Symptom 3: Sam deletes Kai's expense.
await as('Bearer token-sam', 'mutation ($id: ID!) { deleteExpense(id: $id) }', { id: String(taxi._id) });

// Symptom 4: a bad id.
await as('Bearer token-sam', 'mutation { updateExpense(id: "abc", title: "x") { title } }');
