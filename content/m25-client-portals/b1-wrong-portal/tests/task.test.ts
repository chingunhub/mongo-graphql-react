import { expect } from 'expect';
import { handle } from '../api';
import { sign } from '../tokens';

const helpApp = sign({ clientPortalId: 'cp-help' });
const partnersApp = sign({ clientPortalId: 'cp-partners' });
const token = (userId: string, expiresInMs = 60_000) => sign({ userId }, expiresInMs);
const forged = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64');

const ask = (operation: string, headers: Record<string, string | undefined>, variables = {}, cookies?: Record<string, string>) =>
  handle({ operation, variables, headers, cookies });
const ids = (response: any) => (response.data as any[]).map((ticket) => ticket._id).sort();
const message = (response: any) => response.errors?.[0]?.message;

test(
  'customers still see their own tickets on their own portal',
  async () => {
    const mara = { 'x-app-token': helpApp, 'client-auth-token': token('u-mara') };
    const otto = { 'x-app-token': partnersApp, 'client-auth-token': token('u-otto') };
    expect(ids(await ask('cpGetTickets', mara))).toEqual(['t1', 't4']);
    expect(ids(await ask('cpGetTickets', otto))).toEqual(['t3']);
    expect((await ask('cpGetTicket', mara, { _id: 't1' })).data).toMatchObject({ subject: 'Printer is on fire' });
    expect((await ask('cpCurrentUser', mara)).data).toEqual({ _id: 'u-mara', email: 'mara@example.com' });
  },
  { hint: 'This works today and has to keep working.' },
);

test(
  'a login page still knows its portal, and a session can still ride in a cookie',
  async () => {
    expect(await ask('cpCurrentUser', { 'x-app-token': helpApp })).toEqual({ data: null });
    expect(message(await ask('cpCurrentUser', {}))).toBe('Client portal required');
    expect(message(await ask('cpGetTickets', { 'x-app-token': helpApp }))).toBe('Client portal user required');
    const viaCookie = await ask('cpGetTickets', { 'x-app-token': helpApp }, {}, { 'client-auth-token': token('u-nina') });
    expect(ids(viaCookie)).toEqual(['t2']);
    const expired = await ask('cpGetTickets', { 'x-app-token': helpApp, 'client-auth-token': token('u-mara', -1) });
    expect(message(expired)).toBe('Client portal user required');
  },
  { hint: 'This works today and has to keep working.' },
);

test(
  'the Help site does not greet a Partners customer as signed in',
  async () => {
    const ottoOnHelp = { 'x-app-token': helpApp, 'client-auth-token': token('u-otto') };
    expect(await ask('cpCurrentUser', ottoOnHelp)).toEqual({ data: null });
    expect(message(await ask('cpGetTickets', ottoOnHelp))).toBe('Client portal user required');
    const maraOnPartners = { 'x-app-token': partnersApp, 'client-auth-token': token('u-mara') };
    expect(await ask('cpCurrentUser', maraOnPartners)).toEqual({ data: null });
  },
  { hint: 'Report #5120. What ties an account to one portal, when both portals sign their tokens with the same secret?' },
);

test(
  "a ticket link opens for the customer who filed it, and for nobody else",
  async () => {
    const otto = { 'x-app-token': partnersApp, 'client-auth-token': token('u-otto') };
    const mara = { 'x-app-token': helpApp, 'client-auth-token': token('u-mara') };
    const nina = { 'x-app-token': helpApp, 'client-auth-token': token('u-nina') };
    expect(message(await ask('cpGetTicket', otto, { _id: 't2' }))).toBe('Ticket not found');
    expect(message(await ask('cpGetTicket', mara, { _id: 't2' }))).toBe('Ticket not found');
    expect(message(await ask('cpGetTicket', nina, { _id: 't1' }))).toBe('Ticket not found');
    expect((await ask('cpGetTicket', nina, { _id: 't2' })).data).toMatchObject({ subject: 'Refund for order 5512' });
    expect(message(await ask('cpGetTicket', nina, { _id: 't-none' }))).toBe('Ticket not found');
  },
  { hint: 'Report #5121. The guard passed for everyone here. Which question does no guard ask?' },
);

test(
  'a request with no auth token is never treated as somebody',
  async () => {
    const asAdmin = forged({ _id: 'u-admin', clientPortalId: 'cp-help', email: 'admin@example.com' });
    const asMara = forged({ _id: 'whoever', clientPortalId: 'cp-help', email: 'x@example.com', erxesCustomerId: 'c-17' });
    expect(message(await ask('cpGetTickets', { 'x-app-token': helpApp, cpuser: asAdmin }))).toBe('Client portal user required');
    expect(message(await ask('cpGetTickets', { 'x-app-token': helpApp, cpuser: asMara }))).toBe('Client portal user required');
    expect(await ask('cpCurrentUser', { 'x-app-token': helpApp, cpuser: asAdmin })).toEqual({ data: null });
  },
  { hint: 'Report #5122. Which component is supposed to be the only writer of the identity headers, and what did it do with the one it was sent?' },
);

test(
  'and a request with no tokens at all is never treated as a portal',
  async () => {
    const portal = forged({ _id: 'cp-help', name: 'Acme Help' });
    const user = forged({ _id: 'u-nina', clientPortalId: 'cp-help', email: 'nina@example.com' });
    expect(message(await ask('cpGetTickets', { clientportal: portal, cpuser: user }))).toBe('Client portal required');
    expect(message(await ask('cpCurrentUser', { clientportal: portal }))).toBe('Client portal required');
    const badApp = await ask('cpGetTickets', { 'x-app-token': 'garbage', clientportal: portal, cpuser: user });
    expect(message(badApp)).toBe('Client portal required');
  },
  { hint: 'The same hole as #5122, one step earlier. Where does the function return before it has cleaned anything?' },
);

test(
  'a real session wins over anything the caller wrote by hand',
  async () => {
    const asMara = forged({ _id: 'whoever', clientPortalId: 'cp-help', email: 'x@example.com', erxesCustomerId: 'c-17' });
    const nina = { 'x-app-token': helpApp, 'client-auth-token': token('u-nina'), cpuser: asMara };
    expect(ids(await ask('cpGetTickets', nina))).toEqual(['t2']);
    expect((await ask('cpCurrentUser', nina)).data).toEqual({ _id: 'u-nina', email: 'nina@example.com' });
  },
  { hint: 'This works today and has to keep working.' },
);
