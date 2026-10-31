// Small helpers shared by every resolver file. (Provided — read, don't edit.)
import { GraphQLError } from 'graphql';

/**
 * A reference field may hold an ObjectId, a populated document, or null.
 * idOf() gives you the id either way, so field resolvers don't care how the parent was loaded.
 */
export function idOf(ref: unknown): unknown {
  if (ref == null) return null;
  return (ref as { _id?: unknown })._id ?? ref;
}

/** Dates must be serialized explicitly — returning a Date for a String field gives milliseconds. */
export function toISO(value: Date | string | number): string {
  return new Date(value).toISOString();
}

/** `Issue not found` with extensions.code NOT_FOUND. */
export function notFound(what: string): GraphQLError {
  return new GraphQLError(`${what} not found`, { extensions: { code: 'NOT_FOUND' } });
}
