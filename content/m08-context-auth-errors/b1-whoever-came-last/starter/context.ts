import { User } from './models/User';

export interface Context {
  currentUser: any | null;
}

let currentUser: any = null;

/** Called once per request. */
export async function buildContext({ req }: { req: { headers: Record<string, string | undefined> } }): Promise<Context> {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /i, '');
  if (token) currentUser = await User.findOne({ token });
  return { currentUser };
}
