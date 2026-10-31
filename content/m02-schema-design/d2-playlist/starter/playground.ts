import { Playlist, addTrack, removeTrack, totalDuration } from './models/Playlist';

const list = await Playlist.create({ name: 'Focus' });

await addTrack(String(list._id), { title: 'Weightless', artist: 'Marconi Union', seconds: 485 });
const updated: any = await addTrack(String(list._id), { title: 'Intro', artist: 'The xx', seconds: 128 });
console.log(updated?.tracks);
console.log('total:', updated && totalDuration(updated));

try {
  await addTrack(String(list._id), { title: 'Silence', artist: 'Nobody', seconds: 0 });
} catch (e) {
  console.log('rejected:', (e as Error).message);
}
