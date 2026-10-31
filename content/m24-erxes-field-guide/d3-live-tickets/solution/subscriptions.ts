import { PubSub, withFilter } from 'graphql-subscriptions';

export type Ticket = { _id: string; subject: string; priority: string };
export type LiveContext = { subdomain: string; user?: { _id: string } };

const detailChannel = (subdomain: string, _id: string) => `ticketChanged:${subdomain}:${_id}`;

export async function publishTicketChanged(pubsub: PubSub, subdomain: string, ticket: Ticket) {
  await pubsub.publish(detailChannel(subdomain, ticket._id), { ticketChanged: ticket });
  await pubsub.publish('ticketListChanged', { subdomain, ticketListChanged: ticket });
}

function requireLogin(context: LiveContext) {
  if (!context.user?._id) throw new Error('Login required');
}

export function generateResolvers(pubsub: PubSub) {
  const listChanges = withFilter(
    () => pubsub.asyncIterableIterator('ticketListChanged'),
    (payload: any, variables: any, context: any) => {
      if (payload.subdomain !== context.subdomain) return false;
      return !variables.priority || payload.ticketListChanged.priority === variables.priority;
    },
  );

  return {
    ticketChanged: {
      subscribe: (_root: unknown, { _id }: { _id: string }, context: LiveContext): any => {
        requireLogin(context);
        return pubsub.asyncIterableIterator(detailChannel(context.subdomain, _id));
      },
    },
    ticketListChanged: {
      subscribe: (root: unknown, args: { priority?: string | null }, context: LiveContext, info?: any): any => {
        requireLogin(context);
        return listChanges(root, args, context, info);
      },
    },
  };
}
