import mongoose from 'mongoose';
import { Note } from './models/Note';
import { User } from './models/User';
import { unauthenticated, forbidden, notFound } from './errors';
import type { Context } from './context';

type NoteDoc = { _id: unknown; owner: unknown; shared: boolean; createdAt: Date };

function requireUser(ctx: Context) {
  if (!ctx.currentUser) throw unauthenticated();
  return ctx.currentUser;
}

const isOwner = (note: NoteDoc, user: any) => !!user && String(note.owner) === String(user._id);
const canSee = (note: NoteDoc, user: any) => note.shared || isOwner(note, user);

/** Load a note for writing: NOT_FOUND if invisible, FORBIDDEN if visible but not mine. */
async function loadForWrite(id: string, user: any) {
  const note = mongoose.isValidObjectId(id) ? await Note.findById(id) : null;
  if (!note || !canSee(note, user)) throw notFound('Note');
  if (!isOwner(note, user)) throw forbidden();
  return note;
}

export const resolvers = {
  Query: {
    myNotes: (_: unknown, __: unknown, ctx: Context) => {
      const user = requireUser(ctx);
      return Note.find({ owner: user._id }).sort({ createdAt: -1, _id: -1 }).exec();
    },
    note: async (_: unknown, { id }: { id: string }, ctx: Context) => {
      const note = mongoose.isValidObjectId(id) ? await Note.findById(id) : null;
      return note && canSee(note, ctx.currentUser) ? note : null;
    },
  },
  Mutation: {
    createNote: (_: unknown, { input }: { input: Record<string, unknown> }, ctx: Context) => {
      const user = requireUser(ctx);
      return Note.create({ ...input, owner: user._id });
    },
    updateNote: async (_: unknown, { id, input }: { id: string; input: Record<string, unknown> }, ctx: Context) => {
      const user = requireUser(ctx);
      const note = await loadForWrite(id, user);
      for (const [k, v] of Object.entries(input)) if (v !== undefined) note.set(k, v);
      return note.save();
    },
    deleteNote: async (_: unknown, { id }: { id: string }, ctx: Context) => {
      const user = requireUser(ctx);
      const note = await loadForWrite(id, user);
      await note.deleteOne();
      return String(note._id);
    },
  },
  Note: {
    id: (n: NoteDoc) => String(n._id),
    owner: (n: NoteDoc) => User.findById(n.owner).exec(),
    createdAt: (n: NoteDoc) => new Date(n.createdAt).toISOString(),
  },
  User: {
    id: (u: { _id: unknown }) => String(u._id),
  },
};
