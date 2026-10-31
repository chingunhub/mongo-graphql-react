import { GraphQLError, type GraphQLFormattedError } from 'graphql';

export const unauthenticated = () =>
  new GraphQLError('You must be logged in', { extensions: { code: 'UNAUTHENTICATED' } });
export const forbidden = () =>
  new GraphQLError('You cannot change this expense', { extensions: { code: 'FORBIDDEN' } });
export const notFound = () =>
  new GraphQLError('Expense not found', { extensions: { code: 'NOT_FOUND' } });

export function formatError(formatted: GraphQLFormattedError, _error: unknown): GraphQLFormattedError {
  if (formatted.extensions?.code === 'INTERNAL_SERVER_ERROR') {
    return { message: 'Something went wrong', extensions: { code: 'INTERNAL_SERVER_ERROR' } };
  }
  return formatted;
}
