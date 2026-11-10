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
  throw new Error('TODO: write the value as base64 JSON');
}

/** Reads a base64 JSON header back, or returns undefined. */
export function readHeader<T>(headers: Headers, name: string): T | undefined {
  throw new Error('TODO: decode the header, and survive a broken one');
}

/** Works out which portal, and which portal user, a request comes from. It never throws. */
export async function portalIdentity(req: GatewayRequest, models: Models): Promise<void> {
  throw new Error('TODO: describe the caller');
}
