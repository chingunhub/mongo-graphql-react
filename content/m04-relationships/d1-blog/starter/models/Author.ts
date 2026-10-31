import mongoose, { Schema } from 'mongoose';

const authorSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  avatar: { type: String, default: '' },
});

// TODO: virtual `posts` (published only, newest first)
// TODO: virtual `publishedCount`
// TODO: include virtuals in toJSON / toObject

export const Author = mongoose.model('Author', authorSchema);
