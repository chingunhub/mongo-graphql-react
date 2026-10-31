import { createServer } from './server';
import { Recipe } from './models/Recipe';

const server = createServer();
const run = async (query: string, variables?: Record<string, unknown>) => {
  const res = await server.executeOperation({ query, variables });
  console.log(JSON.stringify(res.body.kind === 'single' ? res.body.singleResult : res.body, null, 2));
};

const toast = await Recipe.create({ title: 'Avocado toast', minutes: 5, tags: ['Breakfast'] });
await Recipe.create({ title: 'Ramen', minutes: 45, ingredients: [{ name: 'noodles', quantity: '200g' }] });

await run('{ recipes { id title minutes createdAt ingredientCount } }');
await run('{ recipe(id: "not-an-id") { title } }');
await run(
  'mutation($id: ID!) { addIngredient(recipeId: $id, ingredient: { name: "lime", quantity: "1/2" }) { title ingredients { name } } }',
  { id: String(toast._id) },
);
