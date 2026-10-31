import { expect } from 'expect';
import mongoose from 'mongoose';
import { resetDb } from '@forge/kit';
import { Team } from '../models/Team';
import { Player } from '../models/Player';
import { getRoster } from '../services/roster';

let hawks: any, theo: any, ines: any;

beforeEach(async () => {
  await resetDb();
  hawks = await Team.create({ name: 'Harbor Hawks' });
  const owls = await Team.create({ name: 'Night Owls' });
  theo = await Player.create({ name: 'Theo', number: 7, team: hawks._id });
  ines = await Player.create({ name: 'Ines', number: 4, team: hawks._id });
  await Player.create({ name: 'Other', number: 1, team: owls._id });
  hawks.captain = theo._id;
  await hawks.save();
});

test('symptom 1: the roster lists the team’s players, sorted by number', async () => {
  const r = await getRoster(String(hawks._id));
  expect(r!.players.map((p) => p.name)).toEqual(['Ines', 'Theo']);
}, { hint: 'Read the virtual populate on Team: localField / foreignField.' });

test('symptom 2: the captain is flagged', async () => {
  const r = await getRoster(String(hawks._id));
  const byName = Object.fromEntries(r!.players.map((p) => [p.name, p.isCaptain]));
  expect(byName).toEqual({ Ines: false, Theo: true });
}, { hint: 'Two ObjectId objects are never === to each other.' });

test('a team without a captain flags nobody', async () => {
  const owls = await Team.findOne({ name: 'Night Owls' });
  const r = await getRoster(String(owls!._id));
  expect(r!.players.map((p) => p.isCaptain)).toEqual([false]);
});

test('symptom 3: the roster includes the team id as a string', async () => {
  const r = await getRoster(String(hawks._id));
  expect(r!.id).toBe(String(hawks._id));
}, { hint: 'Lean objects have _id but not the id virtual.' });

test('player ids and the full shape are right', async () => {
  const r = await getRoster(String(hawks._id));
  expect(r).toEqual({
    id: String(hawks._id),
    name: 'Harbor Hawks',
    players: [
      { id: String(ines._id), name: 'Ines', number: 4, isCaptain: false },
      { id: String(theo._id), name: 'Theo', number: 7, isCaptain: true },
    ],
  });
});

test('unknown team → null', async () => {
  expect(await getRoster(String(new mongoose.Types.ObjectId()))).toBeNull();
});

test('players are sorted by the query, not by luck', async () => {
  // The unique index on { team, number } can hand rows back in number order for free. Without it, only a sort can.
  await Player.collection.dropIndexes();
  try {
    const r = await getRoster(String(hawks._id));
    expect(r!.players.map((p: any) => p.name)).toEqual(['Ines', 'Theo']);
  } finally {
    await Player.syncIndexes();
  }
}, { hint: 'Virtual populate takes options: populate({ path, options: { sort } }).' });
