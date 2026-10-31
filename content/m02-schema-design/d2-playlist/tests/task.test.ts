import { expect } from 'expect';
import mongoose from 'mongoose';
import { resetDb } from '@forge/kit';
import { Playlist, addTrack, removeTrack, totalDuration } from '../models/Playlist';

beforeEach(resetDb);

const t = (title: string, seconds = 200) => ({ title, artist: 'Someone', seconds });

test('a playlist requires a name and starts with no tracks', async () => {
  await expect(Playlist.create({})).rejects.toThrow(/name/);
  const p: any = await Playlist.create({ name: ' Focus ' });
  expect(p.name).toBe('Focus');
  expect(p.tracks).toHaveLength(0);
});

test('addTrack appends a track and persists it', async () => {
  const p: any = await Playlist.create({ name: 'Focus' });
  const updated: any = await addTrack(String(p._id), t('Weightless', 485));
  expect(updated).toBeTruthy();
  expect(updated.tracks.map((x: any) => x.title)).toEqual(['Weightless']);
  const fromDb: any = await Playlist.findById(p._id);
  expect(fromDb.tracks).toHaveLength(1);
}, { hint: 'push onto playlist.tracks, then await playlist.save().' });

test('tracks get their own _id', async () => {
  const p: any = await Playlist.create({ name: 'Focus' });
  const updated: any = await addTrack(String(p._id), t('Intro'));
  expect(updated.tracks[0]._id).toBeInstanceOf(mongoose.Types.ObjectId);
});

test('track fields are validated (required, trimmed, seconds >= 1)', async () => {
  const p: any = await Playlist.create({ name: 'Focus' });
  await expect(addTrack(String(p._id), { title: 'Silence', artist: 'Nobody', seconds: 0 })).rejects.toThrow(/seconds/);
  await expect(addTrack(String(p._id), { title: 'No artist' } as any)).rejects.toThrow(/artist/);
  const ok: any = await addTrack(String(p._id), { title: '  Intro ', artist: ' The xx ', seconds: 128 });
  expect(ok.tracks[0].title).toBe('Intro');
  expect(ok.tracks[0].artist).toBe('The xx');
  const fromDb: any = await Playlist.findById(p._id);
  expect(fromDb.tracks).toHaveLength(1);
}, { hint: 'Element rules belong in the track schema.' });

test('a playlist holds at most 50 tracks', async () => {
  const p: any = await Playlist.create({ name: 'Big', tracks: Array.from({ length: 50 }, (_, i) => t('Song ' + i)) });
  await expect(addTrack(String(p._id), t('One too many'))).rejects.toThrow('A playlist can hold at most 50 tracks');
  const fromDb: any = await Playlist.findById(p._id);
  expect(fromDb.tracks).toHaveLength(50);
}, { hint: 'Put a validate option on the tracks path — it receives the whole array.' });

test('addTrack / removeTrack resolve to null for a missing playlist', async () => {
  const missing = String(new mongoose.Types.ObjectId());
  expect(await addTrack(missing, t('x'))).toBeNull();
  expect(await removeTrack(missing, String(new mongoose.Types.ObjectId()))).toBeNull();
});

test('removeTrack removes exactly that track', async () => {
  const p: any = await Playlist.create({ name: 'Focus', tracks: [t('A'), t('B'), t('C')] });
  const target = String(p.tracks[1]._id);
  const updated: any = await removeTrack(String(p._id), target);
  expect(updated.tracks.map((x: any) => x.title)).toEqual(['A', 'C']);
  const fromDb: any = await Playlist.findById(p._id);
  expect(fromDb.tracks.map((x: any) => x.title)).toEqual(['A', 'C']);
}, { hint: 'playlist.tracks.pull(trackId) removes by _id. Then save.' });

test('totalDuration formats m:ss', () => {
  expect(totalDuration({ tracks: [{ seconds: 200 }, { seconds: 185 }, { seconds: 241 }] })).toBe('10:26');
  expect(totalDuration({ tracks: [{ seconds: 66 }] })).toBe('1:06');
  expect(totalDuration({ tracks: [] })).toBe('0:00');
}, { hint: 'Pad seconds to two digits with padStart.' });
