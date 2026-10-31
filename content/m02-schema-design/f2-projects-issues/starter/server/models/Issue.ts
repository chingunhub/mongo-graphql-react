import mongoose, { Schema } from 'mongoose';

export const STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const;
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

// TODO: a label subdocument schema (no _id)

// TODO: the issue schema (+ timestamps) and its compound unique index
const issueSchema = new Schema({});

export const Issue = mongoose.model('Issue', issueSchema);
