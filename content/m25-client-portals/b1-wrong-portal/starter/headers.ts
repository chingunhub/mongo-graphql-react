export type Headers = Record<string, string | undefined>;

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
