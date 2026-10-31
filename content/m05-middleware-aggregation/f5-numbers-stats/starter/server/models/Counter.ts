import mongoose, { Schema } from 'mongoose';

// TODO: _id is a string like "issue:<projectId>", seq is a number
const counterSchema = new Schema({});

export const Counter = mongoose.model('Counter', counterSchema);

export async function nextSequence(name: string): Promise<number> {
  // TODO: atomic upsert + $inc
  return 0;
}
