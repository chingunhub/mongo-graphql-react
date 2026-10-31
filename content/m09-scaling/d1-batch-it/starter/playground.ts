import { ApolloServer } from '@apollo/server';
import mongoose from 'mongoose';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';
import { createContext } from './context';
import { Artist } from './models/Artist';
import { Album } from './models/Album';
import { Track } from './models/Track';

// Seed: 4 artists, 12 albums, a few tracks each.
const artists = await Artist.create(['Björk', 'Radiohead', 'Massive Attack', 'Portishead'].map((name) => ({ name })));
const albums = await Album.create(
  Array.from({ length: 12 }, (_, i) => ({ title: `Album ${i + 1}`, year: 1990 + i, artist: artists[i % 4]._id })),
);
await Track.create(albums.flatMap((a, i) => Array.from({ length: i % 3 }, (_, t) => ({ title: `T${t}`, seconds: 200, album: a._id }))));

// Count queries the same way the tests do.
let queries = 0;
mongoose.set('debug', () => queries++);

const server = new ApolloServer({ typeDefs, resolvers });
const res = await server.executeOperation(
  { query: '{ albums { title artist { name } trackCount } }' },
  { contextValue: createContext() },
);
console.log(JSON.stringify(res.body.kind === 'single' ? res.body.singleResult.data?.albums?.slice(0, 3) : res.body));
console.log('queries:', queries, '(target: 3)');
