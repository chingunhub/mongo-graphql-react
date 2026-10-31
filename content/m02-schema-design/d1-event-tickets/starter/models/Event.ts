import mongoose, { Schema } from 'mongoose';

export const EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED'] as const;

// TODO: fields + validators from the table in the brief
const eventSchema = new Schema({});

export const Event = mongoose.model('Event', eventSchema);

export async function createEvent(data: Record<string, unknown>) {
  // TODO
}

export async function checkEvent(
  data: Record<string, unknown>,
): Promise<{ valid: true } | { valid: false; errors: Record<string, string> }> {
  // TODO: validate without saving
  return { valid: true };
}
