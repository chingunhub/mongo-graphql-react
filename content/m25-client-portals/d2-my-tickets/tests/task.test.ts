import { expect } from 'expect';
import mongoose from 'mongoose';
import { markResolvers, wrapPublicResolver, type Context } from '../guards';
import { cpTicketMutations, cpTicketQueries, ownerKey } from '../resolvers';
import { Tickets } from '../Tickets';

const help = { _id: 'cp-help', name: 'Acme Help' };
const partners = { _id: 'cp-partners', name: 'Acme Partners' };
const mara = { _id: 'u-mara', clientPortalId: help._id, email: 'mara@example.com', erxesCustomerId: 'c-17' };
const otto = { _id: 'u-otto', clientPortalId: help._id, email: 'otto@example.com' };
// The same linked customer, signed in on the other portal.
const maraPartner = { _id: 'u-mara-p', clientPortalId: partners._id, email: 'mara@example.com', erxesCustomerId: 'c-17' };

const as = (cpUser: typeof mara | typeof otto, clientPortal = help): Context => ({ clientPortal, cpUser });
const call = (fn: any, args: any, context: any) => fn(undefined, args, context, undefined);
const pause = () => new Promise((resolve) => setTimeout(resolve, 5));
const subjects = (tickets: any[]) => tickets.map((ticket) => ticket.subject);

beforeEach(async () => {
  await Tickets.deleteMany({});
});

test(
  'the wrapper asks about the portal, then about the user',
  async () => {
    const seen: any[] = [];
    const resolver = (...args: any[]) => (seen.push(args), 'value');
    const open = wrapPublicResolver(resolver, { forClientPortal: true });
    const signedIn = wrapPublicResolver(resolver, { forClientPortal: true, cpUserRequired: true });

    await expect(call(open, {}, {})).rejects.toThrow('Client portal required');
    await expect(call(open, {}, { cpUser: mara })).rejects.toThrow('Client portal required');
    await expect(call(open, {}, { user: { _id: 'agent-1' } })).rejects.toThrow('Client portal required');
    await expect(call(open, { a: 1 }, { clientPortal: help })).resolves.toBe('value');
    expect(seen).toEqual([[undefined, { a: 1 }, { clientPortal: help }, undefined]]);

    await expect(call(signedIn, {}, {})).rejects.toThrow('Client portal required');
    await expect(call(signedIn, {}, { clientPortal: help })).rejects.toThrow('Client portal user required');
    await expect(call(signedIn, {}, { clientPortal: help, user: { _id: 'agent-1' } })).rejects.toThrow(
      'Client portal user required',
    );
    await expect(call(signedIn, {}, as(mara))).resolves.toBe('value');
  },
  { hint: 'Portal first, then the user if cpUserRequired. A staff user is neither.' },
);

test(
  'a resolver that is not for portals is left alone, and marking replaces in place',
  async () => {
    const plain = wrapPublicResolver(() => 'value', {});
    await expect(call(plain, {}, {})).resolves.toBe('value');
    await expect(call(wrapPublicResolver(() => 'value'), {}, {})).resolves.toBe('value');

    const resolvers: any = { one: () => 1, two: () => 2 };
    const before = resolvers.one;
    markResolvers(resolvers, { forClientPortal: true });
    expect(resolvers.one).not.toBe(before);
    await expect(call(resolvers.one, {}, {})).rejects.toThrow('Client portal required');
    await expect(call(resolvers.one, {}, { clientPortal: help })).resolves.toBe(1);
    await expect(call(resolvers.two, {}, { clientPortal: help })).resolves.toBe(2);
  },
  { hint: 'markResolvers assigns the wrapped function back to the same key, for every key.' },
);

test(
  'every ticket operation needs a signed-in customer',
  async () => {
    const operations = { ...cpTicketQueries, ...cpTicketMutations };
    expect(Object.keys(operations).sort()).toEqual(['cpAddReply', 'cpCreateTicket', 'cpGetTicket', 'cpGetTickets']);
    for (const name of Object.keys(operations)) {
      await expect(call(operations[name], {}, {})).rejects.toThrow('Client portal required');
      await expect(call(operations[name], {}, { clientPortal: help })).rejects.toThrow('Client portal user required');
    }
    expect(await Tickets.countDocuments()).toBe(0);
  },
  { hint: 'Call markResolvers on both objects at the bottom of resolvers.ts, after they are complete.' },
);

test(
  'the owner key prefers the linked customer',
  () => {
    expect(ownerKey(mara)).toBe('cp:c-17');
    expect(ownerKey(otto)).toBe('cp:u-otto');
    expect(ownerKey({ ...otto, erxesCustomerId: '' })).toBe('cp:u-otto');
  },
  { hint: '`cp:` plus erxesCustomerId when there is one, and the account ID otherwise.' },
);

test(
  'a ticket is filed under the caller, whatever the arguments say',
  async () => {
    const ticket = await call(
      cpTicketMutations.cpCreateTicket,
      { subject: '  Printer is on fire  ', description: 'Smoke', userId: 'cp:u-otto', clientPortalId: 'cp-partners', status: 'closed' },
      as(mara),
    );
    const stored = await Tickets.findById(ticket._id).lean();
    expect(stored).toMatchObject({
      subject: 'Printer is on fire',
      description: 'Smoke',
      status: 'open',
      userId: 'cp:c-17',
      clientPortalId: 'cp-help',
      replies: [],
    });
    await expect(call(cpTicketMutations.cpCreateTicket, { subject: '   ' }, as(mara))).rejects.toThrow('Subject required');
    await expect(call(cpTicketMutations.cpCreateTicket, {}, as(mara))).rejects.toThrow('Subject required');
    expect(await Tickets.countDocuments()).toBe(1);
  },
  { hint: 'Take the owner and the portal from context. Pick subject and description out of args by name.' },
);

test(
  'a customer lists their own tickets, newest first',
  async () => {
    await call(cpTicketMutations.cpCreateTicket, { subject: 'First' }, as(mara));
    await pause();
    await call(cpTicketMutations.cpCreateTicket, { subject: "Otto's" }, as(otto));
    await pause();
    await call(cpTicketMutations.cpCreateTicket, { subject: 'Second' }, as(mara));
    // An agent's ticket, and one whose creator ID merely looks similar.
    await Tickets.create({ subject: 'Internal', userId: 'c-17' });
    await Tickets.create({ subject: 'Other portal', userId: 'cp:c-17', clientPortalId: partners._id });

    expect(subjects(await call(cpTicketQueries.cpGetTickets, {}, as(mara)))).toEqual(['Second', 'First']);
    expect(subjects(await call(cpTicketQueries.cpGetTickets, {}, as(otto)))).toEqual(["Otto's"]);
    expect(subjects(await call(cpTicketQueries.cpGetTickets, {}, as(maraPartner, partners)))).toEqual(['Other portal']);
  },
  { hint: 'Filter by the owner key and by the portal, then sort by createdAt descending.' },
);

test(
  'nothing the caller sends can widen the list',
  async () => {
    await call(cpTicketMutations.cpCreateTicket, { subject: "Mara's" }, as(mara));
    await call(cpTicketMutations.cpCreateTicket, { subject: "Otto's" }, as(otto));
    for (const args of [
      { createdBy: 'c-17' },
      { userId: 'cp:c-17' },
      { filter: { createdBy: 'c-17' } },
      { clientPortalId: partners._id },
    ]) {
      expect(subjects(await call(cpTicketQueries.cpGetTickets, args, as(otto)))).toEqual(["Otto's"]);
    }
  },
  { hint: 'Arguments are typed by the caller. Read identity from context only.' },
);

test(
  'the list can be narrowed by status',
  async () => {
    const open = await call(cpTicketMutations.cpCreateTicket, { subject: 'Open' }, as(mara));
    const closed = await call(cpTicketMutations.cpCreateTicket, { subject: 'Closed' }, as(mara));
    await Tickets.updateOne({ _id: closed._id }, { status: 'closed' });
    await call(cpTicketMutations.cpCreateTicket, { subject: "Otto's" }, as(otto));
    expect(subjects(await call(cpTicketQueries.cpGetTickets, { status: 'closed' }, as(mara)))).toEqual(['Closed']);
    expect(subjects(await call(cpTicketQueries.cpGetTickets, { status: 'open' }, as(mara)))).toEqual(['Open']);
    expect(String(open._id)).not.toBe(String(closed._id));
  },
  { hint: 'Add status to the filter when args.status is given. The owner stays in the filter.' },
);

test(
  "one ticket: theirs opens, anybody else's is not found",
  async () => {
    const ticket = await call(cpTicketMutations.cpCreateTicket, { subject: "Mara's" }, as(mara));
    const id = String(ticket._id);
    expect((await call(cpTicketQueries.cpGetTicket, { _id: id }, as(mara))).subject).toBe("Mara's");
    await expect(call(cpTicketQueries.cpGetTicket, { _id: id }, as(otto))).rejects.toThrow('Ticket not found');
    await expect(call(cpTicketQueries.cpGetTicket, { _id: id }, as(maraPartner, partners))).rejects.toThrow('Ticket not found');
    await expect(
      call(cpTicketQueries.cpGetTicket, { _id: String(new mongoose.Types.ObjectId()) }, as(mara)),
    ).rejects.toThrow('Ticket not found');
  },
  { hint: 'Put the owner and the portal into the findOne filter next to _id.' },
);

test(
  'an ID that is not an ID is also just not found',
  async () => {
    for (const _id of ['nope', '', undefined, '123'])
      await expect(call(cpTicketQueries.cpGetTicket, { _id }, as(mara))).rejects.toThrow('Ticket not found');
    await expect(call(cpTicketMutations.cpAddReply, { _id: 'nope', body: 'Hello' }, as(mara))).rejects.toThrow('Ticket not found');
  },
  { hint: 'Mongoose throws a CastError for a malformed ObjectId. Check with mongoose.isValidObjectId first.' },
);

test(
  'a customer replies on their own ticket, and it needs attention again',
  async () => {
    const ticket = await call(cpTicketMutations.cpCreateTicket, { subject: 'Printer' }, as(mara));
    await Tickets.updateOne(
      { _id: ticket._id },
      { status: 'answered', $push: { replies: { body: 'Is it plugged in?', authorId: 'agent-1', createdAt: new Date() } } },
    );
    const before = Date.now();
    const updated = await call(cpTicketMutations.cpAddReply, { _id: String(ticket._id), body: '  Yes, it is.  ' }, as(mara));
    expect(updated.status).toBe('open');
    expect(updated.replies.map((reply: any) => [reply.body, reply.authorId])).toEqual([
      ['Is it plugged in?', 'agent-1'],
      ['Yes, it is.', 'cp:c-17'],
    ]);
    expect(new Date(updated.replies[1].createdAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    const stored = await Tickets.findById(ticket._id).lean();
    expect(stored?.replies).toHaveLength(2);
    expect(stored?.status).toBe('open');
  },
  { hint: 'Push { body, authorId: the owner key, createdAt } and set the status back to open. Return the updated ticket.' },
);

test(
  "replies are refused on someone else's ticket, a closed one, or with nothing to say",
  async () => {
    const ticket = await call(cpTicketMutations.cpCreateTicket, { subject: 'Printer' }, as(mara));
    const id = String(ticket._id);
    await expect(call(cpTicketMutations.cpAddReply, { _id: id, body: 'Hi' }, as(otto))).rejects.toThrow('Ticket not found');
    await expect(call(cpTicketMutations.cpAddReply, { _id: id, body: '   ' }, as(mara))).rejects.toThrow('Reply required');
    await Tickets.updateOne({ _id: id }, { status: 'closed' });
    await expect(call(cpTicketMutations.cpAddReply, { _id: id, body: 'Hi' }, as(mara))).rejects.toThrow('Ticket is closed');
    // Someone who doesn't own it never learns that it's closed.
    await expect(call(cpTicketMutations.cpAddReply, { _id: id, body: 'Hi' }, as(otto))).rejects.toThrow('Ticket not found');
    const stored = await Tickets.findById(id).lean();
    expect(stored?.replies).toEqual([]);
    expect(stored?.status).toBe('closed');
  },
  { hint: 'Check ownership before anything about the ticket\'s state, so a stranger only ever sees "not found".' },
);
