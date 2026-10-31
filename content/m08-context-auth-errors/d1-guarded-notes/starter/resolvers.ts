import mongoose from 'mongoose';
import { Note } from './models/Note';
import { User } from './models/User';
import { unauthenticated, forbidden, notFound } from './errors';
import type { Context } from './context';

export const resolvers = {
  Query: {
    // TODO myNotes, note
  },
  Mutation: {
    // TODO createNote, updateNote, deleteNote
  },
  Note: {
    // TODO id, owner, createdAt
  },
  User: {
    id: (u: { _id: unknown }) => String(u._id),
  },
};
