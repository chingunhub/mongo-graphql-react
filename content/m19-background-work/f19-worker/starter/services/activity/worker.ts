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
  tenant: String,
  eventId: String,
  ticketId: String,
  requestId: String,
  kind: String,
});
export const Activity =
  (mongoose.models.RelayActivity as mongoose.Model<ActivityData>) ||
  mongoose.model<ActivityData>('RelayActivity', schema);
export async function processOpening(input: unknown): Promise<{ id: string; duplicate: boolean }> {
  throw Error('TODO: receipt');
}
export async function enqueueOpening(queue: Pick<Queue, 'add'>, input: unknown) {
  throw Error('TODO: enqueue');
}
