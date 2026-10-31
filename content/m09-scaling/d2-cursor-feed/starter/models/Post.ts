import mongoose, { Schema } from 'mongoose';

const postSchema = new Schema(
  {
    author: { type: String, required: true },
    text: { type: String, required: true, maxlength: 280 },
  },
  { timestamps: true },
);

// Serves the feed's sort, and the cursor's range query.
postSchema.index({ createdAt: -1, _id: -1 });

export const Post = mongoose.model('Post', postSchema);
