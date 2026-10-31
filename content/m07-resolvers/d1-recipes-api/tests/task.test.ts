import { expect } from 'expect';
import mongoose from 'mongoose';
import { resetDb, execute, countQueries } from '@forge/kit';
import { createServer } from '../server';
import { Recipe } from '../models/Recipe';

const server = createServer();
const run = (q: string, v?: Record<string, unknown>) => execute(server, q, v) as Promise<any>;
const ok = async (q: string, v?: Record<string, unknown>) => {
  const r = await run(q, v);
  if (r.errors?.length) throw new Error(r.errors.map((e: any) => e.message).join('; '));
  return r.data;
};

let toast: any, ramen: any;
beforeEach(async () => {
  await resetDb();
  toast = await Recipe.create({ title: 'Avocado toast', minutes: 5, tags: ['breakfast', 'quick'], createdAt: new Date('2026-03-23T00:00:00Z') });
  ramen = await Recipe.create({ title: 'Ramen', minutes: 45, ingredients: [{ name: 'noodles', quantity: '200g' }, { name: 'egg', quantity: '1' }] });
  await Recipe.create({ title: 'Bagel', minutes: 5, tags: ['breakfast'] });
});

test('recipes: sorted by minutes then title, with ids', async () => {
  const d = await ok('{ recipes { id title } }');
  expect(d.recipes.map((r: any) => r.title)).toEqual(['Avocado toast', 'Bagel', 'Ramen']);
  expect(d.recipes[0].id).toBe(String(toast._id));
}, { hint: 'With .lean() there is no `id` virtual — add a Recipe.id resolver from _id. "Query was already executed"? Return query.exec(), not the Query.' });

test('recipes runs a single query', async () => {
  const spy = await countQueries(() => ok('{ recipes { id } }'));
  expect(spy.count).toBe(1);
  const lean = (Recipe as any).find().lean;
  expect(typeof lean).toBe('function');
});

test('recipes(tag) and recipes(maxMinutes) filter; both combine', async () => {
  expect((await ok('{ recipes(tag: "Breakfast") { title } }')).recipes.map((r: any) => r.title)).toEqual(['Avocado toast', 'Bagel']);
  expect((await ok('{ recipes(maxMinutes: 10) { title } }')).recipes).toHaveLength(2);
  expect((await ok('{ recipes(tag: "quick", maxMinutes: 10) { title } }')).recipes.map((r: any) => r.title)).toEqual(['Avocado toast']);
});

test('createdAt is an ISO-8601 string', async () => {
  const d = await ok('{ recipes { title createdAt } }');
  expect(d.recipes[0].createdAt).toBe('2026-03-23T00:00:00.000Z');
}, { hint: 'Returning the Date directly serializes as milliseconds. Use toISOString().' });

test('ingredientCount', async () => {
  const d = await ok('{ recipes { title ingredientCount } }');
  expect(Object.fromEntries(d.recipes.map((r: any) => [r.title, r.ingredientCount]))).toEqual({
    'Avocado toast': 0,
    Bagel: 0,
    Ramen: 2,
  });
});

test('recipe(id) finds one; unknown → null', async () => {
  expect((await ok('query($id: ID!) { recipe(id: $id) { title } }', { id: String(ramen._id) })).recipe.title).toBe('Ramen');
  expect((await ok('query($id: ID!) { recipe(id: $id) { title } }', { id: String(new mongoose.Types.ObjectId()) })).recipe).toBeNull();
});

test('recipe(id) with a malformed id → null, no error', async () => {
  const r = await run('{ recipe(id: "not-an-id") { title } }');
  expect(r.errors).toBeUndefined();
  expect(r.data.recipe).toBeNull();
}, { hint: 'mongoose.isValidObjectId(id) before findById.' });

test('addRecipe creates a recipe (tags and ingredients optional)', async () => {
  const d = await ok('mutation { addRecipe(input: { title: "Porridge", minutes: 10 }) { id title tags ingredients { name } } }');
  expect(d.addRecipe).toMatchObject({ title: 'Porridge', tags: [], ingredients: [] });
  expect(await Recipe.countDocuments({ title: 'Porridge' })).toBe(1);
});

test('addIngredient appends and returns the updated recipe', async () => {
  const d = await ok(
    'mutation($id: ID!) { addIngredient(recipeId: $id, ingredient: { name: "lime", quantity: "1/2" }) { ingredients { name } ingredientCount } }',
    { id: String(toast._id) },
  );
  expect(d.addIngredient).toEqual({ ingredients: [{ name: 'lime' }], ingredientCount: 1 });
}, { hint: 'returnDocument: "after" — otherwise you get the recipe from before the push.' });

test('addIngredient is a single atomic update (no load-then-save)', async () => {
  const { ops } = await countQueries(() =>
    ok('mutation($id: ID!) { addIngredient(recipeId: $id, ingredient: { name: "salt", quantity: "pinch" }) { title } }', {
      id: String(toast._id),
    }),
  );
  expect(ops.map((o) => o.method)).toEqual(['findOneAndUpdate']);
});

test('addIngredient on a missing recipe → NOT_FOUND', async () => {
  for (const id of [String(new mongoose.Types.ObjectId()), 'garbage']) {
    const r = await run('mutation($id: ID!) { addIngredient(recipeId: $id, ingredient: { name: "x", quantity: "1" }) { title } }', { id });
    expect(r.errors?.[0]?.message).toBe('Recipe not found');
    expect(r.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
  }
}, { hint: "new GraphQLError('Recipe not found', { extensions: { code: 'NOT_FOUND' } })" });

test('deleteRecipe: true once, then false; malformed id → false', async () => {
  const q = 'mutation($id: ID!) { deleteRecipe(id: $id) }';
  expect((await ok(q, { id: String(ramen._id) })).deleteRecipe).toBe(true);
  expect((await ok(q, { id: String(ramen._id) })).deleteRecipe).toBe(false);
  expect((await ok(q, { id: 'nope' })).deleteRecipe).toBe(false);
  expect(await Recipe.countDocuments()).toBe(2);
});

test('maxMinutes: 0 is a real value, not "no filter"', async () => {
  expect((await ok('{ recipes(maxMinutes: 0) { title } }')).recipes).toEqual([]);
}, { hint: '0 is falsy. Check for null or undefined, not truthiness.' });
