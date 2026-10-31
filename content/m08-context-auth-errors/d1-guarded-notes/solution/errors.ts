import mongoose from 'mongoose';
import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import { unwrapResolverError } from '@apollo/server/errors';

export const unauthenticated = () =>
  new GraphQLError('You must be logged in', { extensions: { code: 'UNAUTHENTICATED' } });
export const forbidden = () => new GraphQLError('You are not allowed to do that', { extensions: { code: 'FORBIDDEN' } });
export const notFound = (what: string) => new GraphQLError(`${what} not found`, { extensions: { code: 'NOT_FOUND' } });

export function formatError(formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError {
  const original = unwrapResolverError(error);

  // instanceof, not .name: GraphQL's own validation errors are also named "ValidationError".
  if (original instanceof mongoose.Error.ValidationError) {
    const fields = Object.fromEntries(Object.entries(original.errors).map(([path, e]) => [path, e.message]));
    return { ...formatted, message: 'Invalid input', extensions: { code: 'BAD_USER_INPUT', fields } };
  }

  if (formatted.extensions?.code === 'INTERNAL_SERVER_ERROR') {
    console.error('[internal]', original);
    return { message: 'Internal server error', extensions: { code: 'INTERNAL_SERVER_ERROR' } };
  }

  return formatted;
}
