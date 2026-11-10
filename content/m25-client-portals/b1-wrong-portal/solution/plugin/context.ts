import { CLIENT_PORTAL_HEADER, CP_USER_HEADER, readHeader, type Headers } from '../headers';
import type { ClientPortal, CPUser } from '../store';

export type Context = { clientPortal?: ClientPortal; cpUser?: CPUser };

/** The plugin's context: whatever the gateway wrote into the two identity headers. */
export function createContext(headers: Headers): Context {
  return {
    clientPortal: readHeader<ClientPortal>(headers, CLIENT_PORTAL_HEADER),
    cpUser: readHeader<CPUser>(headers, CP_USER_HEADER),
  };
}
