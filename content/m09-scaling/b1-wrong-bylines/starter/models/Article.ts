import mongoose, { Schema } from 'mongoose';

const articleSchema = new Schema({
  title: { type: String, required: true },
  author: { type: Schema.Types.ObjectId, ref: 'Author', required: true },
  reviewers: [{ type: Schema.Types.ObjectId, ref: 'Author' }],
  publishedAt: { type: Date, required: true },
});

export const Article = mongoose.model('Article', articleSchema);
