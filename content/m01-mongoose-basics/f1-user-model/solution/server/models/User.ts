import mongoose, { Schema } from 'mongoose';

export const ROLES = ['MEMBER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    role: { type: String, enum: ROLES, default: 'MEMBER' },
  },
  { timestamps: true },
);

export const User = mongoose.model('User', userSchema);

export async function createUser(data: { name: string; email: string; role?: Role }) {
  return User.create(data);
}

export async function findUserByEmail(email: string) {
  // The schema's trim + lowercase setters also apply to this filter.
  return User.findOne({ email });
}

export async function listUsers() {
  return User.find().sort({ name: 1 });
}
