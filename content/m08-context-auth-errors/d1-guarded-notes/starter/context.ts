import { User } from './models/User';

export interface Context {
  currentUser: any | null;
}

/** Called once per request. Never throws. */
export async function buildContext({ req }: { req: { headers: Record<string, string | undefined> } }): Promise<Context> {
  // TODO: "Authorization: ApiKey <key>" → the user with that apiKey
  return { currentUser: null };
}
