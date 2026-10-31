import type { Delivery, DeliveryDependencies } from './queue-contract';
export async function openDelivery(deps: DeliveryDependencies): Promise<Delivery> {
  let connection: ReturnType<DeliveryDependencies['connection']> | undefined;
  let queue: ReturnType<DeliveryDependencies['queue']> | undefined;
  let events: ReturnType<DeliveryDependencies['events']> | undefined;
  let worker: ReturnType<DeliveryDependencies['worker']> | undefined;
  let closed = false,
    cleanup: Promise<void> | undefined;
  const close = () => {
    closed = true;
    return (cleanup ??= (async () => {
      const errors: unknown[] = [];
      for (const resource of [worker, events, queue])
        if (resource)
          try {
            await resource.close();
          } catch (error) {
            errors.push(error);
          }
      if (connection)
        try {
          connection.disconnect();
        } catch (error) {
          errors.push(error);
        }
      if (errors.length) throw new AggregateError(errors, 'Queue cleanup failed');
    })());
  };
  try {
    connection = deps.connection();
    await connection.ping();
    queue = deps.queue(connection);
    events = deps.events(connection);
    worker = deps.worker(connection);
    await Promise.all([queue.waitUntilReady(), events.waitUntilReady(), worker.waitUntilReady()]);
    const readyQueue = queue,
      readyEvents = events;
    return {
      mode: 'BullMQ / Redis',
      close,
      deliver: async (event) => {
        if (closed) throw Error('CLOSED');
        const job = await deps.enqueue(readyQueue, event);
        return await job.waitUntilFinished(readyEvents, deps.timeoutMs);
      },
    };
  } catch (error) {
    try {
      await close();
    } catch {}
    throw error;
  }
}
