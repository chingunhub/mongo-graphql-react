import DataLoader from 'dataloader';
import { sendTRPCMessage } from '../../../erxes-api-shared';
import type { Contact } from '../../../connectionResolvers';

export const createLoaders = (subdomain: string) => ({
  contact: new DataLoader<string, Contact | null>(async (ids) => {
    throw new Error('TODO: ask the contacts plugin once for all of these IDs');
  }),
});
