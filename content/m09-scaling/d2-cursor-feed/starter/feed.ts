import mongoose from 'mongoose';
import { GraphQLError } from 'graphql';
import { Post } from './models/Post';

export function encodeCursor(post: { createdAt: Date; _id: unknown }): string {
  // TODO
  return '';
}

export function decodeCursor(cursor: string): { createdAt: Date; id: mongoose.Types.ObjectId } {
  // TODO
  throw new Error('Not implemented');
}

export async function feedConnection({ first = 10, after }: { first?: number; after?: string | null }) {
  // TODO
  return { edges: [], pageInfo: { hasNextPage: false, endCursor: null }, totalCount: 0 };
}
