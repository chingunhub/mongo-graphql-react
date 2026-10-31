import { User } from './models/User';

export interface Context {
  currentUser: any | null;
}

/** Called once per request. Never throws. */
export async function buildContext({ req }: { req: { headers: Record<string, string | undefined> } }): Promise<Context> {
  const [scheme, key] = (req.headers.authorization ?? '').trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'apikey' || !key) return { currentUser: null };
  const currentUser = await User.findOne({ apiKey: key });
  return { currentUser };
}
