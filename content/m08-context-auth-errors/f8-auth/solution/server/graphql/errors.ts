import mongoose from 'mongoose';
import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import { unwrapResolverError } from '@apollo/server/errors';
import type { Context } from './resolvers/types';

export const badInput = (message: string, fields?: Record<string, string>) =>
  new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT', ...(fields && { fields }) } });
export const unauthenticated = (message = 'You must be logged in') =>
  new GraphQLError(message, { extensions: { code: 'UNAUTHENTICATED' } });
export const forbidden = (message = 'You are not allowed to do that') =>
  new GraphQLError(message, { extensions: { code: 'FORBIDDEN' } });
export const notFound = (what: string) => new GraphQLError(`${what} not found`, { extensions: { code: 'NOT_FOUND' } });

/** The current user, or throw UNAUTHENTICATED. */
export function requireUser(ctx: Context) {
  if (!ctx.currentUser) throw unauthenticated();
  return ctx.currentUser;
}

/** Apollo Server's formatError hook: map known errors to client errors, mask the rest. */
export function formatError(formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError {
  const original = unwrapResolverError(error) as any;

  // instanceof, not .name: GraphQL's own validation errors are also named "ValidationError".
  if (original instanceof mongoose.Error.ValidationError) {
    const fields = Object.fromEntries(Object.entries(original.errors).map(([path, e]) => [path, e.message]));
    return { ...formatted, message: 'Invalid input', extensions: { code: 'BAD_USER_INPUT', fields } };
  }
  if (original instanceof mongoose.Error.CastError) {
    return { ...formatted, message: `Invalid ${original.path}`, extensions: { code: 'BAD_USER_INPUT' } };
  }
  if (original?.code === 11000) {
    const field = Object.keys(original.keyValue ?? {})[0] ?? 'value';
    return {
      ...formatted,
      message: `That ${field} is already taken`,
      extensions: { code: 'BAD_USER_INPUT', fields: { [field]: `That ${field} is already taken` } },
    };
  }
  if (formatted.extensions?.code === 'INTERNAL_SERVER_ERROR') {
    console.error('[graphql] unexpected error:', original);
    return { message: 'Internal server error', path: formatted.path, extensions: { code: 'INTERNAL_SERVER_ERROR' } };
  }
  return formatted;
}
