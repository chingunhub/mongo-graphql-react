import { PubSub, withFilter } from 'graphql-subscriptions';

export type Ticket = { _id: string; subject: string; priority: string };
export type LiveContext = { subdomain: string; user?: { _id: string } };

export async function publishTicketChanged(pubsub: PubSub, subdomain: string, ticket: Ticket) {
  throw new Error('TODO: publish to both channels');
}

export function generateResolvers(pubsub: PubSub) {
  return {
    ticketChanged: {
      subscribe: (_root: unknown, _args: { _id: string }, _context: LiveContext): any => {
        throw new Error('TODO');
      },
    },
    ticketListChanged: {
      subscribe: (_root: unknown, _args: { priority?: string | null }, _context: LiveContext): any => {
        throw new Error('TODO');
      },
    },
  };
}
