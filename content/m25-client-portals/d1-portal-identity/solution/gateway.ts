import type { ClientPortal, CPUser, Models } from './models';
import { verify } from './tokens';

export type Headers = Record<string, string | undefined>;

export type GatewayRequest = {
  headers: Headers;
  cookies?: Record<string, string | undefined>;
  clientPortal?: ClientPortal;
  cpUser?: CPUser;
};

export const CLIENT_PORTAL_HEADER = 'clientportal';
export const CP_USER_HEADER = 'cpuser';

/** Writes a value into a header as base64 JSON. */
export function setHeader(headers: Headers, name: string, value: unknown): void {
  headers[name] = Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

/** Reads a base64 JSON header back, or returns undefined. */
export function readHeader<T>(headers: Headers, name: string): T | undefined {
  const raw = headers[name];
  if (!raw) return undefined;
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as T;
  } catch {
    return undefined;
  }
}

/** Works out which portal, and which portal user, a request comes from. It never throws. */
export async function portalIdentity(req: GatewayRequest, models: Models): Promise<void> {
  // Whatever the caller wrote into these is not ours: only this function may fill them.
  delete req.headers[CLIENT_PORTAL_HEADER];
  delete req.headers[CP_USER_HEADER];
  delete req.clientPortal;
  delete req.cpUser;

  const appToken = req.headers['x-app-token'];
  if (!appToken) return;

  let clientPortal: ClientPortal | null;
  try {
    const { clientPortalId } = verify<{ clientPortalId: string }>(appToken);
    clientPortal = await models.ClientPortals.findOne({ _id: clientPortalId });
  } catch {
    return;
  }
  if (!clientPortal) return;

  req.clientPortal = clientPortal;
  setHeader(req.headers, CLIENT_PORTAL_HEADER, clientPortal);

  const authToken = req.headers['client-auth-token'] || req.cookies?.['client-auth-token'];
  if (!authToken) return;

  try {
    const { userId } = verify<{ userId: string }>(authToken);
    const cpUser = await models.CPUsers.findOne({ _id: userId, clientPortalId: clientPortal._id });
    if (!cpUser) return;
    req.cpUser = cpUser;
    setHeader(req.headers, CP_USER_HEADER, cpUser);
  } catch {
    // An expired or broken token: the portal is still known, and nobody is signed in.
  }
}
