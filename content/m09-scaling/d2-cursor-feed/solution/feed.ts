import mongoose from 'mongoose';
import { GraphQLError } from 'graphql';
import { Post } from './models/Post';

const badInput = (message: string) => new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });

/** Opaque: base64url of [createdAt ms, id]. Both sort keys, so ties are unambiguous. */
export function encodeCursor(post: { createdAt: Date; _id: unknown }): string {
  return Buffer.from(JSON.stringify([post.createdAt.getTime(), String(post._id)])).toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: Date; id: mongoose.Types.ObjectId } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed)) throw new Error('shape');
    const [t, id] = parsed;
    if (typeof t !== 'number' || typeof id !== 'string' || !mongoose.isObjectIdOrHexString(id)) throw new Error('shape');
    return { createdAt: new Date(t), id: new mongoose.Types.ObjectId(id) };
  } catch {
    throw badInput('Invalid cursor');
  }
}

export async function feedConnection({ first = 10, after }: { first?: number; after?: string | null }) {
  if (!Number.isInteger(first) || first < 1 || first > 50) throw badInput('first must be between 1 and 50');

  const filter: Record<string, unknown> = {};
  if (after) {
    const c = decodeCursor(after);
    // strictly after (C, I) in a descending (createdAt, _id) order
    filter.$or = [{ createdAt: { $lt: c.createdAt } }, { createdAt: c.createdAt, _id: { $lt: c.id } }];
  }

  const [docs, totalCount] = await Promise.all([
    Post.find(filter).sort({ createdAt: -1, _id: -1 }).limit(first + 1), // one extra → hasNextPage
    Post.countDocuments(),
  ]);
  const page = docs.slice(0, first);
  const edges = page.map((node) => ({ cursor: encodeCursor(node), node }));
  return {
    edges,
    pageInfo: { hasNextPage: docs.length > first, endCursor: edges.at(-1)?.cursor ?? null },
    totalCount,
  };
}
