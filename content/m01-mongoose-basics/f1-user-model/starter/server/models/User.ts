import mongoose, { Schema } from 'mongoose';

export const ROLES = ['MEMBER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

// TODO: name, email, role (+ timestamps)
const userSchema = new Schema({});

export const User = mongoose.model('User', userSchema);

export async function createUser(data: { name: string; email: string; role?: Role }) {
  // TODO
}

export async function findUserByEmail(email: string) {
  // TODO
  return null;
}

export async function listUsers() {
  // TODO
  return [];
}
