import { expect } from 'expect';
import mongoose from 'mongoose';
import { resetDb, execute } from '@forge/kit';
import { createServer } from '../server';
import { Event } from '../models/Event';
import { Venue } from '../models/Venue';

const server = createServer();
const run = (q: string, v?: Record<string, unknown>) => execute(server, q, v) as Promise<any>;
const ok = async (q: string, v?: Record<string, unknown>) => {
  const r = await run(q, v);
  if (r.errors?.length) throw new Error(r.errors.map((e: any) => e.message).join('; '));
  return r.data;
};

let pier: any, mill: any, launch: any, farewell: any;
beforeEach(async () => {
  await resetDb();
  [pier, mill] = await Venue.create([
    { name: 'Pier 9', city: 'Oslo' },
    { name: 'The Old Mill', city: 'Bergen' },
  ]);
  farewell = await Event.create({ title: 'Farewell gig', startsAt: new Date('2026-04-02T19:30:00Z'), venue: mill._id });
  launch = await Event.create({ title: 'Launch party', startsAt: new Date('2026-03-23T09:00:00Z'), venue: pier._id });
});

test('a healthy page still works: events in date order, each with its venue', async () => {
  const d = await ok('{ events { id title venue { id name city } } }');
  expect(d.events.map((e: any) => e.title)).toEqual(['Launch party', 'Farewell gig']);
  expect(d.events[0].id).toBe(String(launch._id));
  expect(d.events[0].venue).toEqual({ id: String(pier._id), name: 'Pier 9', city: 'Oslo' });
  expect(d.events[1].venue.name).toBe('The Old Mill');
});

test('symptom 1: a deleted venue no longer blanks the page', async () => {
  await mill.deleteOne();
  const r = await run('{ events { title venue { name } } }');
  expect(r.errors).toBeUndefined();
  expect(r.data).not.toBeNull();
  expect(r.data.events.map((e: any) => e.title)).toContain('Launch party');
}, { hint: 'A null in a non-null field bubbles up to the nearest nullable parent. Here that parent is the whole response. Which `!` promises something the data cannot keep?' });

test('symptom 1: the affected event stays listed, with venue null', async () => {
  await mill.deleteOne();
  const d = await ok('{ events { title venue { name } } }');
  expect(d.events).toEqual([
    { title: 'Launch party', venue: { name: 'Pier 9' } },
    { title: 'Farewell gig', venue: null },
  ]);
}, { hint: 'Keep the event, and report what is actually true: it has no venue any more. No filtering, no placeholder venue.' });

test('symptom 2: renameEvent returns the new title', async () => {
  const d = await ok('mutation ($id: ID!) { renameEvent(id: $id, title: "Launch night") { id title } }', { id: String(launch._id) });
  expect(d.renameEvent).toEqual({ id: String(launch._id), title: 'Launch night' });
  expect((await Event.findById(launch._id).lean())?.title).toBe('Launch night');
}, { hint: 'findByIdAndUpdate returns the document as it was before the update unless you ask otherwise.' });

test('symptom 3: startsAt is an ISO string', async () => {
  const d = await ok('{ events { startsAt } }');
  expect(d.events.map((e: any) => e.startsAt)).toEqual(['2026-03-23T09:00:00.000Z', '2026-04-02T19:30:00.000Z']);
}, { hint: 'Add a startsAt resolver under Event. A Date has a method that produces exactly this format.' });

test('symptom 3: the date is right on a single event and after a rename too', async () => {
  const d = await ok('query ($id: ID!) { event(id: $id) { startsAt } }', { id: String(farewell._id) });
  expect(d.event.startsAt).toBe('2026-04-02T19:30:00.000Z');
  const m = await ok('mutation ($id: ID!) { renameEvent(id: $id, title: "Last gig") { startsAt } }', { id: String(farewell._id) });
  expect(m.renameEvent.startsAt).toBe('2026-04-02T19:30:00.000Z');
}, { hint: 'Fix it on the field, not in one query: a field resolver runs wherever an Event appears.' });

test('symptom 4: a malformed id returns null with no error', async () => {
  const r = await run('{ event(id: "oops") { title } }');
  expect(r.errors).toBeUndefined();
  expect(r.data.event).toBeNull();
}, { hint: 'findById throws a CastError on a string that cannot be an ObjectId. Check the id before you query.' });

test('symptom 4: a well-formed id still finds its event, and a missing one is null', async () => {
  const found = await ok('query ($id: ID!) { event(id: $id) { title } }', { id: String(launch._id) });
  expect(found.event.title).toBe('Launch party');
  const missing = await ok('query ($id: ID!) { event(id: $id) { title } }', { id: String(new mongoose.Types.ObjectId()) });
  expect(missing.event).toBeNull();
});
