import { expect } from 'expect';
import { resetDb } from '@forge/kit';
import { Event, createEvent, checkEvent } from '../models/Event';

beforeEach(resetDb);

const start = new Date('2026-11-20T18:00:00Z');
const end = new Date('2026-11-20T21:00:00Z');
const good = () => ({ title: 'Backend meetup', capacity: 40, startsAt: start, endsAt: end });

test('a valid event saves with defaults (status DRAFT, price 0) and trimmed title', async () => {
  const ev: any = await createEvent({ ...good(), title: '  Backend meetup  ' });
  expect(ev.title).toBe('Backend meetup');
  expect(ev.status).toBe('DRAFT');
  expect(ev.price).toBe(0);
  expect(await Event.countDocuments()).toBe(1);
});

test('title shorter than 3 characters uses the custom message', async () => {
  const r: any = await checkEvent({ ...good(), title: 'Hi' });
  expect(r.valid).toBe(false);
  expect(r.errors.title).toBe('Title must be at least 3 characters');
}, { hint: 'minlength accepts [value, message].' });

test('title longer than 80 characters is rejected', async () => {
  const r: any = await checkEvent({ ...good(), title: 'x'.repeat(81) });
  expect(r.valid).toBe(false);
  expect(Object.keys(r.errors)).toEqual(['title']);
});

test('capacity must be at least 1', async () => {
  const r: any = await checkEvent({ ...good(), capacity: 0 });
  expect(r.valid).toBe(false);
  expect(r.errors.capacity).toBeDefined();
});

test('capacity must be a whole number (custom message)', async () => {
  const r: any = await checkEvent({ ...good(), capacity: 2.5 });
  expect(r.valid).toBe(false);
  expect(r.errors.capacity).toBe('Capacity must be a whole number');
}, { hint: 'A custom validator: { validator: (v) => Number.isInteger(v), message: ... }' });

test('price cannot be negative', async () => {
  const r: any = await checkEvent({ ...good(), price: -5 });
  expect(r.valid).toBe(false);
  expect(r.errors.price).toBeDefined();
});

test('status must be DRAFT, PUBLISHED or CANCELLED', async () => {
  const r: any = await checkEvent({ ...good(), status: 'LIVE' });
  expect(r.valid).toBe(false);
  expect(r.errors.status).toBeDefined();
  expect((await checkEvent({ ...good(), status: 'PUBLISHED' })).valid).toBe(true);
});

test('endsAt must be strictly after startsAt', async () => {
  const before: any = await checkEvent({ ...good(), startsAt: end, endsAt: start });
  expect(before.valid).toBe(false);
  expect(before.errors.endsAt).toBe('Event must end after it starts');
  const same: any = await checkEvent({ ...good(), endsAt: start });
  expect(same.valid).toBe(false);
  expect(same.errors.endsAt).toBe('Event must end after it starts');
}, { hint: 'Use function (value) { ... } — not an arrow — so `this` is the document.' });

test('checkEvent reports every failing field at once', async () => {
  const r: any = await checkEvent({ title: 'Hi', capacity: 2.5, startsAt: start });
  expect(r.valid).toBe(false);
  expect(Object.keys(r.errors).sort()).toEqual(['capacity', 'endsAt', 'title']);
});

test('casting failures appear as field errors too', async () => {
  const r: any = await checkEvent({ ...good(), capacity: 'lots' });
  expect(r.valid).toBe(false);
  expect(r.errors.capacity).toMatch(/Cast to Number/);
});

test('checkEvent returns { valid: true } for a good event and never saves', async () => {
  expect(await checkEvent(good())).toEqual({ valid: true });
  await checkEvent({ title: 'x' });
  expect(await Event.countDocuments()).toBe(0);
}, { hint: 'new Event(data) + await doc.validate() — no save(), no create().' });
