import { CLIENT_PORTAL_HEADER, CP_USER_HEADER, setHeader, type Headers } from './headers';
import { ClientPortals, CPUsers } from './store';
import { verify } from './tokens';

export type GatewayRequest = { headers: Headers; cookies?: Record<string, string | undefined> };

/** Describes the caller in two headers for the plugin. It turns nobody away. */
export async function portalIdentity(req: GatewayRequest): Promise<void> {
  const appToken = req.headers['x-app-token'];
  if (!appToken) return;

  try {
    const { clientPortalId } = verify<{ clientPortalId: string }>(appToken);
    const clientPortal = await ClientPortals.findOne({ _id: clientPortalId });
    if (!clientPortal) return;
    setHeader(req.headers, CLIENT_PORTAL_HEADER, clientPortal);

    const authToken = req.headers['client-auth-token'] || req.cookies?.['client-auth-token'];
    if (!authToken) return;

    try {
      const { userId } = verify<{ userId: string }>(authToken);
      const cpUser = await CPUsers.findOne({ _id: userId });
      if (cpUser) setHeader(req.headers, CP_USER_HEADER, cpUser);
    } catch {
      // An expired or broken token: the portal is known, and nobody is signed in.
    }
  } catch {
    // A bad app token: an anonymous request.
  }
}
