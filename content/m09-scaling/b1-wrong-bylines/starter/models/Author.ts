import mongoose, { Schema } from 'mongoose';

const authorSchema = new Schema({
  name: { type: String, required: true },
});

export const Author = mongoose.model('Author', authorSchema);
