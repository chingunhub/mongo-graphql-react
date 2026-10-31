import express from 'express';
import { createServer, type Server } from 'node:http';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import {
  ApolloGateway,
  IntrospectAndCompose,
  RemoteGraphQLDataSource,
  type GraphQLDataSourceProcessOptions,
} from '@apollo/gateway';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { z } from 'zod';
import { contactSubgraph, ticketSubgraph } from '../services/subgraphs';
import { createTriageRouter } from '../services/triage';
import { ingest } from '../services/tickets/intake';
import { operationReport, dispatchPending } from '../services/operations';
import { processOpening } from '../services/activity/worker';
import { requestContext, type RuntimeContext } from './auth';
import { openQueueDelivery } from './queue';

export type ServeOptions = {
  port: number;
  webDir?: string;
  redisUrl?: string;
  queueNamespace?: string;
};
class RelayDataSource extends RemoteGraphQLDataSource<RuntimeContext> {
  willSendRequest({ request, context }: GraphQLDataSourceProcessOptions<RuntimeContext>) {
    if (request.http && context?.credential) {
      request.http.headers.set('authorization', context.credential);
      request.http.headers.set('x-relay-tenant', context.tenant);
      request.http.headers.set('x-request-id', context.requestId);
    }
  }
}
function listen(server: Server, port: number) {
  return new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}
function closeHttp(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeIdleConnections();
  });
}
export async function serveRelaydesk(options: ServeOptions) {
  const cleanup: Array<() => Promise<unknown>> = [];
  let stopping: Promise<void> | undefined;
  const stop = () =>
    (stopping ??= (async () => {
      const failures: unknown[] = [];
      for (const close of [...cleanup].reverse())
        try {
          await close();
        } catch (error) {
          failures.push(error);
        }
      if (failures.length) throw new AggregateError(failures, 'Runtime cleanup failed');
    })());
  try {
    const subgraphs: Array<{ name: string; url: string }> = [];
    for (const [name, schema] of [
      ['contacts', contactSubgraph()],
      ['tickets', ticketSubgraph()],
    ] as const) {
      const server = new ApolloServer<RuntimeContext>({ schema });
      cleanup.push(() => server.stop());
      const { url } = await startStandaloneServer(server, {
        listen: { host: '127.0.0.1', port: 0 },
        context: async ({ req }) => requestContext(req.headers),
      });
      subgraphs.push({ name, url });
    }
    const gateway = new ApolloGateway({
      supergraphSdl: new IntrospectAndCompose({
        subgraphs,
        introspectionHeaders: {
          authorization: 'Bearer north-agent',
          'x-relay-tenant': 'north',
        },
      }),
      buildService: ({ url }) => new RelayDataSource({ url }),
    });
    const graph = new ApolloServer<RuntimeContext>({ gateway });
    cleanup.push(() => graph.stop());
    await graph.start();
    const queue = options.redisUrl
      ? await openQueueDelivery(options.redisUrl, options.queueNamespace ?? 'forge-relaydesk')
      : null;
    if (queue) cleanup.push(() => queue.close());
    const deliver = queue?.deliver ?? processOpening;
    const app = express();
    app.use(express.json({ limit: '64kb' }));
    const intake = z
      .object({
        sourceId: z.string().min(1),
        subject: z.string().min(1),
        contactId: z.string().min(1),
      })
      .strict();
    app.get('/health', (_req, res) =>
      res.json({
        ready: true,
        delivery: queue?.mode ?? 'direct consumer',
        subgraphs: subgraphs.map((x) => x.name),
      }),
    );
    app.post('/graphql', async (req, res, next) => {
      try {
        const result = await graph.executeOperation(req.body, {
          contextValue: requestContext(req.headers),
        });
        if (result.body.kind !== 'single') throw Error('Unexpected incremental response');
        res.json(result.body.singleResult);
      } catch (error) {
        next(error);
      }
    });
    app.post('/api/intake', async (req, res, next) => {
      try {
        const ticket = await ingest(requestContext(req.headers), intake.parse(req.body));
        res.json({
          id: String(ticket._id),
          subject: ticket.subject,
          version: ticket.version,
        });
      } catch (error) {
        next(error);
      }
    });
    app.get('/api/operations', async (req, res, next) => {
      try {
        res.json(await operationReport(requestContext(req.headers)));
      } catch (error) {
        next(error);
      }
    });
    app.post('/api/dispatch', async (req, res, next) => {
      try {
        const input = z
          .object({ simulateFailure: z.boolean().optional() })
          .strict()
          .parse(req.body ?? {});
        const delivery = input.simulateFailure
          ? async () => {
              throw Error('Simulated delivery outage');
            }
          : deliver;
        res.json(await dispatchPending(requestContext(req.headers), delivery));
      } catch (error) {
        next(error);
      }
    });
    app.use(
      '/trpc',
      createExpressMiddleware({
        router: createTriageRouter(),
        createContext: ({ req }) => requestContext(req.headers),
      }),
    );
    if (options.webDir) app.use(express.static(options.webDir));
    app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const e = error as { code?: string; message?: string };
      const code = e.code ?? e.message;
      const status =
        code === 'UNAUTHORIZED' || code === 'UNAUTHENTICATED'
          ? 401
          : code === 'FORBIDDEN'
            ? 403
            : code === 'BAD_INPUT' || code === 'BAD_REQUEST' || error instanceof z.ZodError
              ? 400
              : 500;
      res.status(status).json({
        error: status === 500 ? 'Service operation failed' : status === 400 ? 'Invalid request' : e.message,
      });
    });
    const http = createServer(app);
    await listen(http, options.port);
    cleanup.push(() => closeHttp(http));
    const address = http.address();
    if (!address || typeof address === 'string') throw Error('Missing bound address');
    return { url: 'http://127.0.0.1:' + address.port + '/', stop };
  } catch (error) {
    try {
      await stop();
    } catch {}
    throw error;
  }
}
