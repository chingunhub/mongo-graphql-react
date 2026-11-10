// What core and the ticket plugin have stored, in memory. (Provided.)
// `find` and `findOne` match every field of the filter, like the Mongoose calls they stand in for.

export type ClientPortal = { _id: string; name: string };
export type CPUser = { _id: string; clientPortalId: string; email: string; erxesCustomerId?: string };
export type Ticket = { _id: string; subject: string; status: 'open' | 'answered' | 'closed'; userId: string; clientPortalId: string };

function model<T extends object>(rows: T[]) {
  const matches = (row: T, filter: Partial<T>) => (Object.keys(filter) as (keyof T)[]).every((key) => row[key] === filter[key]);
  return {
    async findOne(filter: Partial<T>): Promise<T | null> {
      return rows.find((row) => matches(row, filter)) ?? null;
    },
    async find(filter: Partial<T>): Promise<T[]> {
      return rows.filter((row) => matches(row, filter));
    },
  };
}

export const ClientPortals = model<ClientPortal>([
  { _id: 'cp-help', name: 'Acme Help' },
  { _id: 'cp-partners', name: 'Acme Partners' },
]);

export const CPUsers = model<CPUser>([
  { _id: 'u-mara', clientPortalId: 'cp-help', email: 'mara@example.com', erxesCustomerId: 'c-17' },
  { _id: 'u-nina', clientPortalId: 'cp-help', email: 'nina@example.com' },
  { _id: 'u-otto', clientPortalId: 'cp-partners', email: 'otto@example.com' },
]);

export const Tickets = model<Ticket>([
  { _id: 't1', subject: 'Printer is on fire', status: 'open', userId: 'cp:c-17', clientPortalId: 'cp-help' },
  { _id: 't2', subject: 'Refund for order 5512', status: 'answered', userId: 'cp:u-nina', clientPortalId: 'cp-help' },
  { _id: 't3', subject: 'New API key, please', status: 'open', userId: 'cp:u-otto', clientPortalId: 'cp-partners' },
  { _id: 't4', subject: 'Wrong invoice address', status: 'closed', userId: 'cp:c-17', clientPortalId: 'cp-help' },
]);
