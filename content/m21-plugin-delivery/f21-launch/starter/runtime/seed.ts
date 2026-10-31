import mongoose from 'mongoose';
import { Contact } from '../services/contacts/model';
import { Ticket } from '../services/tickets/model';
import { Activity } from '../services/activity/worker';
import { ingest } from '../services/tickets/intake';
import { buildContext } from '../packages/contracts/context';
export async function seedDemo(reset = false) {
  if (!mongoose.connection.name.startsWith('forge_')) throw Error('Demo seed requires a forge_ lab database');
  if (reset) await Promise.all([Contact.deleteMany({}), Ticket.deleteMany({}), Activity.deleteMany({})]);
  for (const [tenant, name] of [
    ['north', 'Mira North'],
    ['south', 'Tsolmon South'],
  ]) {
    await Contact.updateOne({ tenant, id: 'c1' }, { $setOnInsert: { tenant, id: 'c1', name } }, { upsert: true });
    await ingest(buildContext({ id: 'demo', memberships: { [tenant]: 'agent' } }, tenant, 'seed-' + tenant), {
      sourceId: 'welcome',
      subject: 'Welcome to ' + tenant,
      contactId: 'c1',
    });
  }
}
