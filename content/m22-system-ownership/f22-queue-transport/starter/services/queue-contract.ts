import type { Queue, QueueEvents, Worker, Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { OpeningEvent } from './activity/worker';
export interface DeliveryDependencies {
  connection(): Redis;
  queue(connection: Redis): Queue;
  events(connection: Redis): QueueEvents;
  worker(connection: Redis): Worker;
  enqueue(queue: Queue, event: OpeningEvent): Promise<Job>;
  timeoutMs: number;
}
export interface Delivery {
  mode: 'BullMQ / Redis';
  deliver(event: OpeningEvent): Promise<unknown>;
  close(): Promise<void>;
}
