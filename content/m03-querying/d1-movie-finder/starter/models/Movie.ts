import mongoose, { Schema } from 'mongoose';

const movieSchema = new Schema({
  title: { type: String, required: true, trim: true },
  year: { type: Number, required: true },
  rating: { type: Number, min: 0, max: 10, default: 0 },
  genres: [{ type: String, lowercase: true, trim: true }],
});

export const Movie = mongoose.model('Movie', movieSchema);
