import { Queue, QueueEvents, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { enqueueOpening, processOpening, type OpeningEvent } from '../services/activity/worker';

export async function openQueueDelivery(redisUrl: string, namespace: string) {
  const url = new URL(redisUrl);
  if (!['redis:', 'rediss:'].includes(url.protocol)) throw Error('Expected a Redis URL');
  const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    connectTimeout: 3000,
    retryStrategy: () => null,
  });
  connection.on('error', () => {}); // failures are awaited below and exposed through startup/delivery
  let queue: Queue | undefined, events: QueueEvents | undefined, worker: Worker | undefined;
  async function close() {
    await Promise.allSettled([worker?.close(), events?.close(), queue?.close()]);
    connection.disconnect();
  }
  try {
    await connection.ping();
    queue = new Queue('opening', { connection, prefix: namespace });
    events = new QueueEvents('opening', { connection, prefix: namespace });
    worker = new Worker('opening', (job) => processOpening(job.data), {
      connection,
      prefix: namespace,
      concurrency: 2,
    });
    worker.on('error', () => {});
    await Promise.all([queue.waitUntilReady(), events.waitUntilReady(), worker.waitUntilReady()]);
    const readyQueue = queue,
      readyEvents = events;
    return {
      mode: 'BullMQ / Redis' as const,
      deliver: async (event: OpeningEvent) => {
        const job = await enqueueOpening(readyQueue, event);
        return job.waitUntilFinished(readyEvents, 15000);
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
