import { createServer } from './server';
import { Event } from './models/Event';
import { Venue } from './models/Venue';

const server = createServer();
const run = async (query: string, variables?: Record<string, unknown>) => {
  const res = await server.executeOperation({ query, variables });
  console.log(JSON.stringify(res.body.kind === 'single' ? res.body.singleResult : res.body, null, 2));
};

const [pier, closed] = await Venue.create([
  { name: 'Pier 9', city: 'Oslo' },
  { name: 'The Old Mill', city: 'Bergen' },
]);
const launch = await Event.create({ title: 'Launch party', startsAt: new Date('2026-03-23T09:00:00Z'), venue: pier._id });
await Event.create({ title: 'Farewell gig', startsAt: new Date('2026-04-02T19:30:00Z'), venue: closed._id });

// Symptom 3, while the page still loads:
await run('{ events { title startsAt venue { name } } }');

// Symptom 1: the venue closes.
await closed.deleteOne();
await run('{ events { title venue { name } } }');

// Symptom 2:
await run('mutation ($id: ID!) { renameEvent(id: $id, title: "Launch night") { title } }', { id: String(launch._id) });

// Symptom 4:
await run('{ event(id: "oops") { title } }');
