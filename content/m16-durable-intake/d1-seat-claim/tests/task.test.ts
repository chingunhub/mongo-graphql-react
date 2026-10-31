import { expect } from 'expect';
import { Types } from 'mongoose';
import { resetDb } from '@forge/kit';
import { Seat } from '../model';
import { claimSeat } from '../claim';
beforeEach(resetDb);
test(
  'eight concurrent claims have exactly one winner',
  async () => {
    const seat = await Seat.create({});
    const results = await Promise.all(Array.from({ length: 8 }, () => claimSeat(String(seat._id), 0)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await Seat.findById(seat._id).lean()).toMatchObject({
      status: 'reserved',
      version: 1,
    });
  },
  { hint: 'The availability and version check must be in the update filter.' },
);
test('stale version cannot reserve even an available seat', async () => {
  const seat = await Seat.create({ version: 3 });
  expect(await claimSeat(String(seat._id), 2)).toBe(false);
  expect((await Seat.findById(seat._id)).status).toBe('available');
});
test('matching later version wins and increments once', async () => {
  const seat = await Seat.create({ version: 5 });
  expect(await claimSeat(String(seat._id), 5)).toBe(true);
  expect((await Seat.findById(seat._id)).version).toBe(6);
});
test('reserved and missing seats are ordinary conflicts', async () => {
  const seat = await Seat.create({ status: 'reserved' });
  expect(await claimSeat(String(seat._id), 0)).toBe(false);
  expect(await claimSeat(String(new Types.ObjectId()), 0)).toBe(false);
});
