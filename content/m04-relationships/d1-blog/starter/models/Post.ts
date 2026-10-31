import mongoose, { Schema } from 'mongoose';

const postSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    body: { type: String, default: '' },
    published: { type: Boolean, default: false },
    publishedAt: { type: Date, default: null },
    // TODO: author — a required reference to Author
  },
  { timestamps: true },
);

export const Post = mongoose.model('Post', postSchema);
