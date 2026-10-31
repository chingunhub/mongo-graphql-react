import mongoose from 'mongoose';
import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import { unwrapResolverError } from '@apollo/server/errors';

// TODO: unauthenticated(), forbidden(), notFound(what)
export const unauthenticated = (): GraphQLError => new GraphQLError('TODO');
export const forbidden = (): GraphQLError => new GraphQLError('TODO');
export const notFound = (what: string): GraphQLError => new GraphQLError('TODO');

export function formatError(formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError {
  // TODO: map Mongoose ValidationErrors, mask INTERNAL_SERVER_ERRORs
  return formatted;
}
