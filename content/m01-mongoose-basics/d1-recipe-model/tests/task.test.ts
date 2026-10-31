import { expect } from 'expect';
import mongoose from 'mongoose';
import { resetDb } from '@forge/kit';
import { Recipe, createRecipe, findQuickRecipes, countVegetarian } from '../models/Recipe';

beforeEach(resetDb);

test('model is called Recipe and stores into the "recipes" collection', () => {
  expect(Recipe.modelName).toBe('Recipe');
  expect(Recipe.collection.name).toBe('recipes');
});

test('createRecipe saves a recipe and returns the document', async () => {
  const r = await createRecipe({ title: 'Ramen', minutes: 45 });
  expect(r).toBeDefined();
  expect((r as any)._id).toBeDefined();
  expect(await Recipe.countDocuments()).toBe(1);
}, { hint: 'Return the result of Recipe.create(...).' });

test('title is trimmed and vegetarian defaults to false', async () => {
  const r: any = await createRecipe({ title: '  Ramen  ', minutes: 45 });
  expect(r.title).toBe('Ramen');
  expect(r.vegetarian).toBe(false);
});

test('each tag is trimmed and lowercased', async () => {
  const r: any = await createRecipe({ title: 'Shakshuka', minutes: 25, tags: [' Eggs', 'BRUNCH '] });
  expect([...r.tags]).toEqual(['eggs', 'brunch']);
}, { hint: 'Options go on the array *element*: [{ type: String, ... }].' });

test('has createdAt / updatedAt timestamps', async () => {
  const r: any = await createRecipe({ title: 'Ramen', minutes: 45 });
  expect(r.createdAt).toBeInstanceOf(Date);
  expect(r.updatedAt).toBeInstanceOf(Date);
}, { hint: 'Timestamps are a schema *option* — the second argument to new Schema().' });

test('title and minutes are required', async () => {
  await expect(createRecipe({ minutes: 10 } as any)).rejects.toThrow(/title/);
  await expect(createRecipe({ title: 'Toast' } as any)).rejects.toThrow(/minutes/);
});

test('findQuickRecipes filters by "at most" maxMinutes', async () => {
  await Recipe.create([
    { title: 'A', minutes: 10 },
    { title: 'B', minutes: 30 },
    { title: 'C', minutes: 31 },
  ]);
  const quick = await findQuickRecipes(30);
  expect(quick.map((r: any) => r.title).sort()).toEqual(['A', 'B']);
}, { hint: '30 minutes should be included — "at most" is $lte, not $lt.' });

test('findQuickRecipes sorts by minutes, then title', async () => {
  await Recipe.create([
    { title: 'Toast', minutes: 5 },
    { title: 'Omelette', minutes: 10 },
    { title: 'Bagel', minutes: 5 },
    { title: 'Salad', minutes: 10 },
  ]);
  const quick = await findQuickRecipes(60);
  expect(quick.map((r: any) => r.title)).toEqual(['Bagel', 'Toast', 'Omelette', 'Salad']);
});

test('findQuickRecipes returns plain objects with exactly title and minutes', async () => {
  await Recipe.create({ title: 'Toast', minutes: 5, tags: ['bread'], vegetarian: true });
  const [r] = await findQuickRecipes(60);
  expect(r).toBeDefined();
  expect(r instanceof mongoose.Document).toBe(false);
  expect(Object.keys(r).sort()).toEqual(['minutes', 'title']);
}, { hint: 'Exclude _id explicitly in the projection, and use .lean() for plain objects.' });

test('countVegetarian counts only vegetarian recipes', async () => {
  await Recipe.create([
    { title: 'Toast', minutes: 5, vegetarian: true },
    { title: 'Ramen', minutes: 45 },
    { title: 'Salad', minutes: 10, vegetarian: true },
  ]);
  const n = await countVegetarian();
  expect(typeof n).toBe('number');
  expect(n).toBe(2);
});
