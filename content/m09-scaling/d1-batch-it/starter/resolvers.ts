import { Album } from './models/Album';
import { Artist } from './models/Artist';
import { Track } from './models/Track';
import type { Context } from './context';

// Correct… and one query per album per field. Refactor the three field resolvers to use ctx.loaders.
export const resolvers = {
  Query: {
    albums: () => Album.find().sort({ title: 1 }).exec(),
    artists: () => Artist.find().sort({ name: 1 }).exec(),
  },
  Album: {
    id: (a: any) => String(a._id),
    artist: (a: any, _args: unknown, _ctx: Context) => Artist.findById(a.artist).exec(),
    trackCount: (a: any, _args: unknown, _ctx: Context) => Track.countDocuments({ album: a._id }).exec(),
  },
  Artist: {
    id: (a: any) => String(a._id),
    albums: (a: any, _args: unknown, _ctx: Context) => Album.find({ artist: a._id }).sort({ year: 1, _id: 1 }).exec(),
  },
};
