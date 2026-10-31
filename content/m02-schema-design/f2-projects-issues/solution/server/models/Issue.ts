import mongoose, { Schema } from 'mongoose';

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
  { timestamps: true },
);

// TF-1 and API-1 may both exist; two TF-1s may not.
issueSchema.index({ project: 1, number: 1 }, { unique: true });

export const Issue = mongoose.model('Issue', issueSchema);
