import mongoose, { Schema } from 'mongoose';

// TODO: define the schema (see the table in the brief)
const recipeSchema = new Schema({});

export const Recipe = mongoose.model('Recipe', recipeSchema);

export async function createRecipe(data: {
  title: string;
  minutes: number;
  tags?: string[];
  vegetarian?: boolean;
}) {
  // TODO
}

export async function findQuickRecipes(maxMinutes: number) {
  // TODO
  return [];
}

export async function countVegetarian() {
  // TODO
  return 0;
}
