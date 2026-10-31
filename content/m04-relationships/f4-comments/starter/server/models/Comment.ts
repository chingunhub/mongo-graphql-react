import mongoose, { Schema } from 'mongoose';

// TODO: issue, author, body (+ timestamps) and an index on { issue: 1, createdAt: 1 }
const commentSchema = new Schema({});

export const Comment = mongoose.model('Comment', commentSchema);
