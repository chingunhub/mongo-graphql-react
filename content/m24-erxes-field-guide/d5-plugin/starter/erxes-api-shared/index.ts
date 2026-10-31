// A small stand-in for erxes-api-shared, with the same names and call shapes.
// Lab simplifications: the subdomain comes from an x-subdomain header, plugins
// register in memory, and each plugin serves GraphQL itself.
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { createTRPCUntypedClient, httpBatchLink } from '@trpc/client';
import { parse } from 'graphql';

export type User = { _id: string; isOwner?: boolean; actions?: string[] };
type Headers = Record<string, string | string[] | undefined>;
type Resolvers = Record<string, (root: any, args: any, context: any, info: any) => any>;

// --- Models ---------------------------------------------------------------

export const createGenerateModels = <T extends Record<string, mongoose.Model<any>>>(
  loadClasses: (db: mongoose.Connection, subdomain: string) => T,
) => {
  const loaded = new Map<string, Promise<T>>();
  return async (subdomain: string): Promise<T> => {
    if (!/^[a-z0-9-]{1,20}$/.test(subdomain)) throw new Error('Invalid subdomain');
    let pending = loaded.get(subdomain);
    if (!pending) {
      pending = (async () => {
        const db = mongoose.connection.useDb(`${mongoose.connection.name}_${subdomain}`, { useCache: true });
        const models = loadClasses(db, subdomain);
        await Promise.all(Object.values(models).map((model) => model.init()));
        return models;
      })();
      loaded.set(subdomain, pending);
    }
    return pending;
  };
};

// --- Identity -------------------------------------------------------------

export const setUserHeader = (headers: Headers, user: User) => {
  headers.user = Buffer.from(JSON.stringify(user)).toString('base64');
};

export const extractUserFromHeader = (headers: Headers): User | null => {
  const header = headers.user;
  if (!header) return null;
  if (Array.isArray(header)) throw new Error('Multiple user headers');
  return JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
};

// --- Guards ---------------------------------------------------------------

export const checkLogin = (user?: User | null) => {
  if (!user || !user._id) throw new Error('Login required');
};

const can = (action: string, user?: User | null) =>
  user?.isOwner === true || Boolean(user?.actions?.includes(action));

export const requireLogin = (cls: Resolvers, methodName: string) => {
  const oldMethod = cls[methodName];
  cls[methodName] = async (root, args, context, info) => {
    checkLogin(context.user);
    return oldMethod(root, args, context, info);
  };
};

export const moduleRequireLogin = (mdl: Resolvers) => {
  for (const method of Object.keys(mdl)) requireLogin(mdl, method);
};

export const checkPermission = (cls: Resolvers, methodName: string, action: string, defaultValue?: unknown) => {
  const oldMethod = cls[methodName];
  cls[methodName] = async (root, args, context, info) => {
    checkLogin(context.user);
    if (!can(action, context.user)) {
      if (defaultValue !== undefined) return defaultValue;
      throw new Error('Permission required');
    }
    return oldMethod(root, args, context, info);
  };
};

// --- Plugin messages ------------------------------------------------------

const plugins = new Map<string, string>();

type MessageProps = {
  subdomain: string;
  method?: 'query' | 'mutation';
  pluginName: string;
  module: string;
  action: string;
  input?: unknown;
  defaultValue?: any;
};

// As in erxes, every failure becomes defaultValue, and so does any falsy result.
export const sendTRPCMessage = async ({
  subdomain,
  method = 'query',
  pluginName,
  module,
  action,
  input,
  defaultValue,
}: MessageProps) => {
  const address = plugins.get(pluginName);
  if (!address) return defaultValue;
  try {
    const client = createTRPCUntypedClient({
      links: [httpBatchLink({ url: `${address}/trpc`, headers: { 'x-subdomain': subdomain } })],
    });
    const result = await client[method](`${module}.${action}`, input);
    return result || defaultValue;
  } catch {
    return defaultValue;
  }
};

// --- startPlugin ----------------------------------------------------------

type PluginOptions = {
  name: string;
  port?: number;
  graphql: () => Promise<{ typeDefs: string; resolvers: any }>;
  apolloServerContext?: (subdomain: string, context: any) => Promise<any>;
  trpcAppRouter?: {
    router: any;
    createContext: (subdomain: string, context: any) => Promise<any>;
  };
};

const subdomainOf = (headers: Headers) => {
  const subdomain = headers['x-subdomain'];
  if (typeof subdomain !== 'string') throw new Error('Missing subdomain');
  return subdomain;
};

const closeHttp = (server: Server) =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeIdleConnections();
  });

export async function startPlugin(options: PluginOptions) {
  const { typeDefs, resolvers } = await options.graphql();
  const graph = new ApolloServer<any>({
    schema: buildSubgraphSchema([{ typeDefs: parse(typeDefs), resolvers }]),
    includeStacktraceInErrorResponses: false,
  });
  await graph.start();

  const app = express();
  app.use(express.json({ limit: '64kb' }));
  app.post('/graphql', async (req, res, next) => {
    try {
      let contextValue: any;
      try {
        const subdomain = subdomainOf(req.headers);
        const context = { subdomain, user: extractUserFromHeader(req.headers) };
        contextValue = options.apolloServerContext
          ? await options.apolloServerContext(subdomain, context)
          : context;
      } catch (error) {
        res.status(400).json({ errors: [{ message: (error as Error).message }] });
        return;
      }
      const result = await graph.executeOperation(req.body, { contextValue });
      if (result.body.kind !== 'single') throw new Error('Unexpected incremental response');
      res.json(result.body.singleResult);
    } catch (error) {
      next(error);
    }
  });

  const trpc = options.trpcAppRouter;
  if (trpc) {
    app.use(
      '/trpc',
      createExpressMiddleware({
        router: trpc.router,
        createContext: ({ req }) => {
          const subdomain = subdomainOf(req.headers);
          return trpc.createContext(subdomain, { subdomain });
        },
      }),
    );
  }

  const http = createServer(app);
  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(options.port ?? 0, '127.0.0.1', () => {
      http.off('error', reject);
      resolve();
    });
  });
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  plugins.set(options.name, url);

  let stopping: Promise<void> | undefined;
  const stop = () =>
    (stopping ??= (async () => {
      plugins.delete(options.name);
      await closeHttp(http);
      await graph.stop();
    })());
  return { url, stop };
}
