import { startPlugin } from './erxes-api-shared';
import { generateModels } from './connectionResolvers';
import { createLoaders } from './modules/tickets/graphql/loaders';
import { resolvers } from './modules/tickets/graphql/resolvers';
import { typeDefs } from './modules/tickets/graphql/typeDefs';
import { appRouter } from './modules/tickets/trpc';

export function startTickets() {
  return startPlugin({
    name: 'tickets',
    graphql: async () => ({ typeDefs, resolvers }),
    apolloServerContext: async (subdomain, context) => {
      context.models = await generateModels(subdomain);
      context.loaders = createLoaders(subdomain);
      return context;
    },
    trpcAppRouter: {
      router: appRouter,
      createContext: async (subdomain, context) => {
        context.models = await generateModels(subdomain);
        return context;
      },
    },
  });
}
