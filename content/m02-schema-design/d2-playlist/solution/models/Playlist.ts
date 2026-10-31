import mongoose, { Schema } from 'mongoose';

const trackSchema = new Schema({
  title: { type: String, required: true, trim: true },
  artist: { type: String, required: true, trim: true },
  seconds: { type: Number, required: true, min: 1 },
});

const playlistSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    tracks: {
      type: [trackSchema],
      validate: {
        validator: (tracks: unknown[]) => tracks.length <= 50,
        message: 'A playlist can hold at most 50 tracks',
      },
    },
  },
  { timestamps: true },
);

export const Playlist = mongoose.model('Playlist', playlistSchema);

export async function addTrack(playlistId: string, track: { title: string; artist: string; seconds: number }) {
  const playlist = await Playlist.findById(playlistId);
  if (!playlist) return null;
  playlist.tracks.push(track);
  await playlist.save();
  return playlist;
}

export async function removeTrack(playlistId: string, trackId: string) {
  const playlist = await Playlist.findById(playlistId);
  if (!playlist) return null;
  playlist.tracks.pull(trackId);
  await playlist.save();
  return playlist;
}

export function totalDuration(playlist: { tracks: { seconds: number }[] }): string {
  const total = playlist.tracks.reduce((sum, t) => sum + t.seconds, 0);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
