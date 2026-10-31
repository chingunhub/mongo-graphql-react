import mongoose, { Schema } from 'mongoose';

const ingredientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    quantity: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const recipeSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    minutes: { type: Number, required: true, min: 1 },
    tags: [{ type: String, trim: true, lowercase: true }],
    ingredients: { type: [ingredientSchema], default: [] },
  },
  { timestamps: true },
);

export const Recipe = mongoose.model('Recipe', recipeSchema);
