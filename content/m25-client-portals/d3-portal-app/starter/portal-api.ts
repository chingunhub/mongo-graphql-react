// The three operations this site uses, and the shape of a request. (Provided.)

export const LOGIN = 'clientPortalUserLoginWithCredentials';
export const TICKETS = 'cpGetTickets';
export const CREATE_TICKET = 'cpCreateTicket';

export type Ticket = { _id: string; subject: string; status: 'open' | 'answered' | 'closed' };

/** A GraphQL-shaped answer: the value is under `data[operation]`, or there are errors. */
export type Answer = { data?: Record<string, any> | null; errors?: { message: string }[] };

/**
 * Sends one operation to the gateway. The site decides which headers go with it.
 *
 * | Operation        | Variables             | `data[operation]`   |
 * | ---------------- | --------------------- | ------------------- |
 * | `LOGIN`          | `{ email, password }` | `{ token }`         |
 * | `TICKETS`        | `{}`                  | `Ticket[]`, newest first |
 * | `CREATE_TICKET`  | `{ subject }`         | the new `Ticket`    |
 */
export type Send = (
  operation: string,
  variables: Record<string, unknown>,
  headers: Record<string, string>,
) => Promise<Answer>;

export const USER_REQUIRED = 'Client portal user required';
export const PORTAL_REQUIRED = 'Client portal required';
