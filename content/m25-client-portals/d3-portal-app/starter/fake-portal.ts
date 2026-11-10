// A pretend gateway and ticket plugin for the preview: the same checks, in memory. (Provided.)
import { CREATE_TICKET, LOGIN, PORTAL_REQUIRED, TICKETS, USER_REQUIRED, type Answer, type Send, type Ticket } from './portal-api';

export const APP_TOKEN = 'app-token-of-acme-help';

const accounts = [
  { id: 'u-mara', email: 'mara@example.com', password: 'portal' },
  { id: 'u-otto', email: 'otto@example.com', password: 'portal' },
];

export type Logged = { operation: string; headers: string[]; answer: string };

/** `sessionMs` is how long a sign-in lasts. The preview keeps it short, so you can watch one end. */
export function createFakePortal(options: { sessionMs?: number; delayMs?: number; onRequest?: (entry: Logged) => void } = {}) {
  const { sessionMs = 60_000, delayMs = 300, onRequest } = options;
  const sessions = new Map<string, { id: string; until: number }>();
  const tickets = new Map<string, Ticket[]>([
    ['u-mara', [{ _id: 't2', subject: 'Invoice shows the wrong address', status: 'answered' }, { _id: 't1', subject: 'Printer is on fire', status: 'open' }]],
    ['u-otto', []],
  ]);
  let next = 3;

  const error = (message: string): Answer => ({ data: null, errors: [{ message }] });

  function answer(operation: string, variables: Record<string, unknown>, headers: Record<string, string>): Answer {
    if (headers['x-app-token'] !== APP_TOKEN) return error(PORTAL_REQUIRED);
    if (operation === LOGIN) {
      const account = accounts.find((a) => a.email === variables.email && a.password === variables.password);
      if (!account) return error('Invalid login');
      const token = `auth-${account.id}-${Date.now()}`;
      sessions.set(token, { id: account.id, until: Date.now() + sessionMs });
      return { data: { [LOGIN]: { token } } };
    }
    const session = sessions.get(headers['client-auth-token'] ?? '');
    if (!session || session.until <= Date.now()) return error(USER_REQUIRED);
    const mine = tickets.get(session.id)!;
    if (operation === TICKETS) return { data: { [TICKETS]: [...mine] } };
    if (operation === CREATE_TICKET) {
      const ticket: Ticket = { _id: `t${next++}`, subject: String(variables.subject), status: 'open' };
      mine.unshift(ticket);
      return { data: { [CREATE_TICKET]: ticket } };
    }
    return error(`Unknown operation ${operation}`);
  }

  const send: Send = async (operation, variables, headers) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    const result = answer(operation, variables, headers);
    onRequest?.({
      operation,
      headers: Object.keys(headers).filter((name) => headers[name]),
      answer: result.errors?.[0]?.message ?? 'ok',
    });
    return result;
  };
  return { send };
}
