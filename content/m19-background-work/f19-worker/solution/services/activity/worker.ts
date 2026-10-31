import mongoose, { Schema } from 'mongoose';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { Queue } from 'bullmq';
export const openingEvent = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    tenant: z.string().min(1),
    ticketId: z.string().min(1),
    type: z.literal('ticket.opened'),
    requestId: z.string().min(1),
  })
  .strict();
export type OpeningEvent = z.infer<typeof openingEvent>;
export interface ActivityData {
  tenant: string;
  eventId: string;
  ticketId: string;
  requestId: string;
  kind: string;
}
const schema = new Schema<ActivityData>({
  tenant: { type: String, required: true },
  eventId: { type: String, required: true },
  ticketId: { type: String, required: true },
  requestId: { type: String, required: true },
  kind: { type: String, required: true },
});
schema.index({ tenant: 1, eventId: 1 }, { unique: true });
export const Activity =
  (mongoose.models.RelayActivity as mongoose.Model<ActivityData>) ||
  mongoose.model<ActivityData>('RelayActivity', schema);
export async function processOpening(input: unknown): Promise<{ id: string; duplicate: boolean }> {
  const event = openingEvent.parse(input);
  try {
    const row = await Activity.create({
      tenant: event.tenant,
      eventId: event.id,
      ticketId: event.ticketId,
      requestId: event.requestId,
      kind: event.type,
    });
    return { id: String(row._id), duplicate: false };
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const row = await Activity.findOne({
      tenant: event.tenant,
      eventId: event.id,
    }).lean();
    if (!row) throw error;
    return { id: String(row._id), duplicate: true };
  }
}
export async function enqueueOpening(queue: Pick<Queue, 'add'>, input: unknown) {
  const event = openingEvent.parse(input);
  const jobId = createHash('sha256')
    .update(JSON.stringify([event.tenant, event.id]))
    .digest('hex');
  return queue.add('ticket.opened', event, {
    jobId,
    attempts: 4,
    backoff: { type: 'exponential', delay: 250 },
    removeOnComplete: 100,
    removeOnFail: 100,
  });
}
