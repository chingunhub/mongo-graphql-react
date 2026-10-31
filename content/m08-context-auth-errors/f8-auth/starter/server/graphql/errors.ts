import mongoose from 'mongoose';
import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import { unwrapResolverError } from '@apollo/server/errors';
import type { Context } from './resolvers/types';

// TODO: badInput(message, fields?), unauthenticated(message?), forbidden(message?), notFound(what)

/** The current user, or throw UNAUTHENTICATED. */
export function requireUser(ctx: Context) {
  // TODO
  return ctx.currentUser;
}

/** Apollo Server's formatError hook: map known errors to client errors, mask the rest. */
export function formatError(formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError {
  // TODO
  return formatted;
}
