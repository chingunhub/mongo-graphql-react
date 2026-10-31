import DataLoader from 'dataloader';
import { sendTRPCMessage } from '../../../erxes-api-shared';
import type { Contact } from '../../../connectionResolvers';

export const createLoaders = (subdomain: string) => ({
  contact: new DataLoader<string, Contact | null>(async (ids) => {
    const contacts: Contact[] = await sendTRPCMessage({
      subdomain,
      pluginName: 'contacts',
      module: 'contacts',
      action: 'find',
      input: { ids: [...ids] },
      defaultValue: [],
    });
    const byId = new Map(contacts.map((contact) => [contact._id, contact]));
    return ids.map((id) => byId.get(id) ?? null);
  }),
});
