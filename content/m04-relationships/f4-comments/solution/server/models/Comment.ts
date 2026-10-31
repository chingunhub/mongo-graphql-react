import mongoose, { Schema } from 'mongoose';

const commentSchema = new Schema(
  {
    issue: { type: Schema.Types.ObjectId, ref: 'Issue', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

// Every comment query is "comments of issue X, in time order".
commentSchema.index({ issue: 1, createdAt: 1 });

export const Comment = mongoose.model('Comment', commentSchema);
