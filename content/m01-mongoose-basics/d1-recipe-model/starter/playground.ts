import { createRecipe, findQuickRecipes, countVegetarian } from './models/Recipe';

await createRecipe({ title: '  Shakshuka ', minutes: 25, tags: [' Eggs', 'BRUNCH '], vegetarian: true });
await createRecipe({ title: 'Ramen', minutes: 45, tags: ['noodles'] });
await createRecipe({ title: 'Avocado toast', minutes: 5, vegetarian: true });

console.log(await findQuickRecipes(30));
console.log('vegetarian:', await countVegetarian());
