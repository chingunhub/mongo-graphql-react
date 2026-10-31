import mongoose, { Schema } from 'mongoose';

const commentSchema = new Schema({
  article: { type: Schema.Types.ObjectId, ref: 'Article', required: true },
  body: { type: String, required: true },
});

export const Comment = mongoose.model('Comment', commentSchema);
