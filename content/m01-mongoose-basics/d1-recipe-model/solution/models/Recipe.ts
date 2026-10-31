import mongoose, { Schema } from 'mongoose';

const recipeSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    minutes: { type: Number, required: true },
    tags: [{ type: String, trim: true, lowercase: true }],
    vegetarian: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Recipe = mongoose.model('Recipe', recipeSchema);

export async function createRecipe(data: {
  title: string;
  minutes: number;
  tags?: string[];
  vegetarian?: boolean;
}) {
  return Recipe.create(data);
}

export async function findQuickRecipes(maxMinutes: number) {
  return Recipe.find({ minutes: { $lte: maxMinutes } })
    .sort({ minutes: 1, title: 1 })
    .select('title minutes -_id')
    .lean();
}

export async function countVegetarian() {
  return Recipe.countDocuments({ vegetarian: true });
}
