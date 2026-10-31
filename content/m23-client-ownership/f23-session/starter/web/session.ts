import type { RelaySession, SessionOptions } from './session-contract';
export type { RelaySession } from './session-contract';
export function createSession(options: SessionOptions): RelaySession {
  // TODO: real Apollo + REST + tRPC under one immutable identity.
  throw Error('TODO: browser session');
}
