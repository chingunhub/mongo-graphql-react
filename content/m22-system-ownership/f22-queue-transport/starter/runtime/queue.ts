import { Queue, QueueEvents, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { enqueueOpening, processOpening } from '../services/activity/worker';
import { openDelivery } from '../services/queue-delivery';
export async function openQueueDelivery(redisUrl: string, namespace: string) {
  const url = new URL(redisUrl);
  if (!['redis:', 'rediss:'].includes(url.protocol)) throw Error('Expected a Redis URL');
  return openDelivery({
    connection: () => {
      const connection = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        connectTimeout: 3000,
        retryStrategy: () => null,
      });
      connection.on('error', () => {});
      return connection;
    },
    queue: (connection) => new Queue('opening', { connection, prefix: namespace }),
    events: (connection) => new QueueEvents('opening', { connection, prefix: namespace }),
    worker: (connection) => {
      const worker = new Worker('opening', (job) => processOpening(job.data), {
        connection,
        prefix: namespace,
        concurrency: 2,
      });
      worker.on('error', () => {});
      return worker;
    },
    enqueue: enqueueOpening,
    timeoutMs: 15000,
  });
}
