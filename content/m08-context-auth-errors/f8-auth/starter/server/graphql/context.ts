import mongoose from 'mongoose';
import { User } from '../models/User';
import { verifyToken } from '../auth/tokens';
import type { Context } from './resolvers/types';

/**
 * Called by Apollo Server once per request.
 * "Authorization: Bearer <token>" with a valid token → that user. Anything else → anonymous. Never throws.
 */
export async function buildContext({ req }: { req: { headers: Record<string, string | string[] | undefined> } }): Promise<Context> {
  // TODO
  return { currentUser: null };
}
