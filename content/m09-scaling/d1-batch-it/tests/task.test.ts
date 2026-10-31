import { expect } from 'expect';
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';
import { resetDb, execute, countQueries } from '@forge/kit';
import { typeDefs } from '../schema';
import { resolvers } from '../resolvers';
import { createContext } from '../context';
import { createLoaders } from '../loaders';
import { Artist } from '../models/Artist';
import { Album } from '../models/Album';
import { Track } from '../models/Track';

const server = new ApolloServer({ typeDefs, resolvers });
let artists: any[], albums: any[];

beforeEach(async () => {
  await resetDb();
  artists = await Artist.create(['Björk', 'Radiohead', 'Massive Attack', 'Portishead', 'Silent Artist'].map((name) => ({ name })));
  albums = await Album.create(
    Array.from({ length: 12 }, (_, i) => ({ title: `Album ${String(i + 1).padStart(2, '0')}`, year: 2001 - i, artist: artists[i % 4]._id })),
  );
  await Track.create(albums.flatMap((a, i) => Array.from({ length: i % 3 }, (_, t) => ({ title: `T${t}`, seconds: 200, album: a._id }))));
});

const run = async (q: string) => {
  const r: any = await execute(server, q, undefined, createContext());
  if (r.errors?.length) throw new Error(r.errors.map((e: any) => e.message).join('; '));
  return r.data;
};

test('responses are unchanged', async () => {
  const d = await run('{ albums { title year artist { name } trackCount } }');
  expect(d.albums[0]).toEqual({ title: 'Album 01', year: 2001, artist: { name: 'Björk' }, trackCount: 0 });
  expect(d.albums[2]).toEqual({ title: 'Album 03', year: 1999, artist: { name: 'Massive Attack' }, trackCount: 2 });
  const a = await run('{ artists { name albums { year } } }');
  expect(a.artists.find((x: any) => x.name === 'Björk').albums.map((al: any) => al.year)).toEqual([1993, 1997, 2001]);
  expect(a.artists.find((x: any) => x.name === 'Silent Artist').albums).toEqual([]);
});

test('albums with artist and trackCount: 3 queries total', async () => {
  const { count } = await countQueries(() => run('{ albums { title artist { name } trackCount } }'));
  expect(count).toBe(3);
}, { hint: 'One query for albums, one $in for artists, one aggregation for track counts.' });

test('artists with albums: 2 queries total', async () => {
  const { count } = await countQueries(() => run('{ artists { name albums { title } } }'));
  expect(count).toBe(2);
});

test('artistById keeps key order and returns null for missing ids', async () => {
  const loaders = createLoaders();
  const missing = String(new mongoose.Types.ObjectId());
  const result = await loaders.artistById.loadMany([String(artists[2]._id), missing, String(artists[0]._id)]);
  expect(result.map((a: any) => a?.name ?? null)).toEqual(['Massive Attack', null, 'Björk']);
}, { hint: 'keys.map(id => map.get(id) ?? null) — never return the DB results as-is.' });

test('trackCountByAlbum: one aggregation, 0 for albums without tracks', async () => {
  const loaders = createLoaders();
  const ids = albums.slice(0, 4).map((a) => String(a._id));
  const { result, count, ops } = await countQueries(() => loaders.trackCountByAlbum.loadMany(ids));
  expect(result).toEqual([0, 1, 2, 0]);
  expect(count).toBe(1);
  expect(ops[0].method).toBe('aggregate');
}, { hint: 'Aggregation needs real ObjectIds in $in.' });

test('albumsByArtist: arrays, oldest first, [] when none', async () => {
  const loaders = createLoaders();
  const [radiohead, silent] = await loaders.albumsByArtist.loadMany([String(artists[1]._id), String(artists[4]._id)]);
  expect((radiohead as any[]).map((a) => a.year)).toEqual([1992, 1996, 2000]);
  expect(silent).toEqual([]);
});

test('createContext gives fresh loaders every call', () => {
  const a = createContext();
  const b = createContext();
  expect(a.loaders).toBeDefined();
  expect(a.loaders.artistById).toBeDefined();
  expect(a.loaders.artistById).not.toBe(b.loaders.artistById);
}, { hint: 'Never share loaders across requests — their cache never expires.' });
