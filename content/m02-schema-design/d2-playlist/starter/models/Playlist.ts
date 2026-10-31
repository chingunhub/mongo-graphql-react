import mongoose, { Schema } from 'mongoose';

// TODO: track subdocument schema
const trackSchema = new Schema({});

// TODO: playlist schema with an array of tracks (max 50)
const playlistSchema = new Schema({});

export const Playlist = mongoose.model('Playlist', playlistSchema);

export async function addTrack(playlistId: string, track: { title: string; artist: string; seconds: number }) {
  // TODO
}

export async function removeTrack(playlistId: string, trackId: string) {
  // TODO
}

export function totalDuration(playlist: { tracks: { seconds: number }[] }): string {
  // TODO: "m:ss"
  return '';
}
