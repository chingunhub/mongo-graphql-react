import mongoose from 'mongoose';
import { GraphQLError } from 'graphql';
import { Recipe } from '../models/Recipe';

export const resolvers = {
  Query: {
    // TODO: recipes(tag, maxMinutes) — lean, sorted by minutes then title
    // TODO: recipe(id) — null for unknown or malformed ids
  },
  Mutation: {
    // TODO: addRecipe, addIngredient, deleteRecipe
  },
  Recipe: {
    // TODO: id, createdAt, ingredientCount
  },
};
