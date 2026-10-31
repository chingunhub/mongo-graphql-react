import { Event, createEvent, checkEvent } from './models/Event';

const start = new Date('2026-11-20T18:00:00Z');
const end = new Date('2026-11-20T21:00:00Z');

console.log(await checkEvent({ title: 'Hi', capacity: 2.5, startsAt: start }));
console.log(await checkEvent({ title: 'Backend meetup', capacity: 40, startsAt: end, endsAt: start }));

const ok = await createEvent({ title: '  Backend meetup ', capacity: 40, startsAt: start, endsAt: end });
console.log(ok);
console.log('events in db:', await Event.countDocuments());
