import mongoose, { Schema } from 'mongoose';

const projectSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    key: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      match: [/^[A-Z]{2,5}$/, 'Project key must be 2–5 letters'],
    },
    description: { type: String, default: '' },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true },
);

export const Project = mongoose.model('Project', projectSchema);
