import { Album } from './models/Album';
import { Artist } from './models/Artist';
import type { Context } from './context';

export const resolvers = {
  Query: {
    albums: () => Album.find().sort({ title: 1 }).exec(),
    artists: () => Artist.find().sort({ name: 1 }).exec(),
  },
  Album: {
    id: (a: any) => String(a._id),
    artist: (a: any, _args: unknown, ctx: Context) => ctx.loaders.artistById.load(String(a.artist)),
    trackCount: (a: any, _args: unknown, ctx: Context) => ctx.loaders.trackCountByAlbum.load(String(a._id)),
  },
  Artist: {
    id: (a: any) => String(a._id),
    albums: (a: any, _args: unknown, ctx: Context) => ctx.loaders.albumsByArtist.load(String(a._id)),
  },
};
