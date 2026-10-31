import DataLoader from 'dataloader';
import mongoose from 'mongoose';
import { Album } from './models/Album';
import { Artist } from './models/Artist';
import { Track } from './models/Track';

const toObjectIds = (ids: readonly string[]) => ids.map((id) => new mongoose.Types.ObjectId(id));

export function createLoaders() {
  return {
    artistById: new DataLoader<string, any>(async (ids) => {
      const artists = await Artist.find({ _id: { $in: ids } });
      const byId = new Map(artists.map((a) => [String(a._id), a]));
      return ids.map((id) => byId.get(id) ?? null); // same order as keys; null for missing
    }),

    trackCountByAlbum: new DataLoader<string, number>(async (ids) => {
      const rows: { _id: unknown; n: number }[] = await Track.aggregate([
        { $match: { album: { $in: toObjectIds(ids) } } }, // aggregation: cast ids yourself
        { $group: { _id: '$album', n: { $sum: 1 } } },
      ]);
      const counts = new Map(rows.map((r) => [String(r._id), r.n]));
      return ids.map((id) => counts.get(id) ?? 0);
    }),

    // One-to-many: each key maps to an array.
    albumsByArtist: new DataLoader<string, any[]>(async (ids) => {
      const albums = await Album.find({ artist: { $in: ids } }).sort({ year: 1, _id: 1 });
      const groups = new Map<string, any[]>(ids.map((id) => [id, []]));
      for (const album of albums) groups.get(String(album.artist))?.push(album);
      return ids.map((id) => groups.get(id) ?? []);
    }),
  };
}

export type Loaders = ReturnType<typeof createLoaders>;
