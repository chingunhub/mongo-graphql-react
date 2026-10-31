import mongoose from 'mongoose';
import { User } from '../models/User';
import { verifyToken } from '../auth/tokens';
import type { Context } from './resolvers/types';

/**
 * Called by Apollo Server once per request.
 * "Authorization: Bearer <token>" with a valid token → that user. Anything else → anonymous. Never throws.
 */
export async function buildContext({ req }: { req: { headers: Record<string, string | string[] | undefined> } }): Promise<Context> {
  const header = String(req.headers.authorization ?? '');
  const [scheme, token] = header.trim().split(/\s+/);
  let currentUser = null;
  if (scheme?.toLowerCase() === 'bearer' && token) {
    const payload = verifyToken(token);
    // Load the user fresh: they may have been deleted or demoted since the token was issued.
    if (payload && mongoose.isValidObjectId(payload.userId)) currentUser = await User.findById(payload.userId);
  }
  return { currentUser };
}
