import DataLoader from 'dataloader';
import mongoose from 'mongoose';
import { Album } from './models/Album';
import { Artist } from './models/Artist';
import { Track } from './models/Track';

export function createLoaders() {
  return {
    // TODO: artistById, trackCountByAlbum, albumsByArtist
  } as any;
}

export type Loaders = ReturnType<typeof createLoaders>;
