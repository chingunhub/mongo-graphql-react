import mongoose, { Schema } from 'mongoose';

const authorSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    avatar: { type: String, default: '' },
  },
  { toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

authorSchema.virtual('posts', {
  ref: 'Post',
  localField: '_id',
  foreignField: 'author',
  match: { published: true },
  options: { sort: { publishedAt: -1 } },
});

authorSchema.virtual('publishedCount', {
  ref: 'Post',
  localField: '_id',
  foreignField: 'author',
  match: { published: true },
  count: true,
});

export const Author = mongoose.model('Author', authorSchema);
