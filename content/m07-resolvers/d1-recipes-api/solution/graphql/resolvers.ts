import mongoose from 'mongoose';
import { GraphQLError } from 'graphql';
import { Recipe } from '../models/Recipe';

type RecipeLike = { _id: unknown; createdAt: Date; ingredients?: unknown[] };

const notFound = () => new GraphQLError('Recipe not found', { extensions: { code: 'NOT_FOUND' } });

export const resolvers = {
  Query: {
    recipes: (_: unknown, { tag, maxMinutes }: { tag?: string; maxMinutes?: number }) => {
      const filter: Record<string, unknown> = {};
      if (tag) filter.tags = tag.toLowerCase();
      if (maxMinutes !== undefined && maxMinutes !== null) filter.minutes = { $lte: maxMinutes };
      return Recipe.find(filter).sort({ minutes: 1, title: 1, _id: 1 }).lean().exec();
    },
    recipe: async (_: unknown, { id }: { id: string }) => (mongoose.isValidObjectId(id) ? await Recipe.findById(id) : null),
  },
  Mutation: {
    addRecipe: (_: unknown, { input }: { input: Record<string, unknown> }) => Recipe.create(input),
    addIngredient: async (_: unknown, { recipeId, ingredient }: { recipeId: string; ingredient: unknown }) => {
      if (!mongoose.isValidObjectId(recipeId)) throw notFound();
      const recipe = await Recipe.findByIdAndUpdate(
        recipeId,
        { $push: { ingredients: ingredient } },
        { returnDocument: 'after', runValidators: true },
      );
      if (!recipe) throw notFound();
      return recipe;
    },
    deleteRecipe: async (_: unknown, { id }: { id: string }) => {
      if (!mongoose.isValidObjectId(id)) return false;
      const { deletedCount } = await Recipe.deleteOne({ _id: id });
      return deletedCount === 1;
    },
  },
  Recipe: {
    // These work for both Mongoose documents and lean objects.
    id: (r: RecipeLike) => String(r._id),
    createdAt: (r: RecipeLike) => new Date(r.createdAt).toISOString(),
    ingredientCount: (r: RecipeLike) => r.ingredients?.length ?? 0,
  },
};
