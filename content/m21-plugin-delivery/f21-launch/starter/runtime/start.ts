import mongoose from 'mongoose';
import { orderPlugins } from '../packages/contracts/plugins';
import { Ticket } from '../services/tickets/model';
import { Contact } from '../services/contacts/model';
import { Activity } from '../services/activity/worker';
import { boot } from '../services/lifecycle';
import { serveRelaydesk, type ServeOptions } from './serve';
export async function startRelaydesk(options: ServeOptions & { mongoUri: string }) {
  orderPlugins([
    { name: 'contracts', version: 1, requires: [] },
    { name: 'contacts', version: 1, requires: ['contracts'] },
    { name: 'tickets', version: 1, requires: ['contacts', 'contracts'] },
    { name: 'activity', version: 1, requires: ['contracts'] },
    { name: 'console', version: 1, requires: ['tickets', 'activity'] },
  ]);
  return boot({
    connect: async () => {
      await mongoose.connect(options.mongoUri, {
        serverSelectionTimeoutMS: 4000,
      });
    },
    ensureIndexes: async () => {
      await Promise.all([Ticket.createIndexes(), Contact.createIndexes(), Activity.createIndexes()]);
    },
    serve: () => serveRelaydesk(options),
    disconnect: async () => {
      await mongoose.disconnect();
    },
  });
}
