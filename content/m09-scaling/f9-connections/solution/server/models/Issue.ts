import mongoose, { Schema } from 'mongoose';
import { nextSequence } from './Counter';

export const STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const;
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

const labelSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, lowercase: true, maxlength: 30 },
    color: {
      type: String,
      default: '#888888',
      match: [/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #ff8800'],
    },
  },
  { _id: false },
);

const issueSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    number: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
    description: { type: String, default: '' },
    status: { type: String, enum: STATUSES, default: 'TODO' },
    priority: { type: String, enum: PRIORITIES, default: 'MEDIUM' },
    labels: [labelSchema],
    assignee: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

// TF-1 and API-1 may both exist; two TF-1s may not.
issueSchema.index({ project: 1, number: 1 }, { unique: true });
// Serves the board's cursor pagination: one project, newest first, _id as tiebreaker.
issueSchema.index({ project: 1, createdAt: -1, _id: -1 });

// "Comments whose `issue` equals my `_id`", oldest first.
issueSchema.virtual('comments', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'issue',
  options: { sort: { createdAt: 1 } },
});

issueSchema.virtual('commentCount', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'issue',
  count: true,
});

/** Create an issue with the project's next number (TF-1, TF-2…), race-free. */
issueSchema.statics.createInProject = async function (projectId: string, data: Record<string, unknown>) {
  const number = await nextSequence(`issue:${projectId}`);
  return this.create({ ...data, project: projectId, number });
};

export const Issue = mongoose.model('Issue', issueSchema);
