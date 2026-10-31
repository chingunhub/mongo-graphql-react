import mongoose, { Schema } from 'mongoose';

export const EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED'] as const;

const eventSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: 80,
    },
    capacity: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'Capacity must be a whole number' },
    },
    price: { type: Number, default: 0, min: 0 },
    startsAt: { type: Date, required: true },
    endsAt: {
      type: Date,
      required: true,
      validate: {
        validator: function (this: { startsAt?: Date }, value: Date) {
          if (!this.startsAt) return true; // `required` on startsAt reports that case
          return value > this.startsAt;
        },
        message: 'Event must end after it starts',
      },
    },
    status: { type: String, enum: EVENT_STATUSES, default: 'DRAFT' },
  },
  { timestamps: true },
);

export const Event = mongoose.model('Event', eventSchema);

export async function createEvent(data: Record<string, unknown>) {
  return Event.create(data);
}

export async function checkEvent(
  data: Record<string, unknown>,
): Promise<{ valid: true } | { valid: false; errors: Record<string, string> }> {
  try {
    await new Event(data).validate();
    return { valid: true };
  } catch (err) {
    if (!(err instanceof mongoose.Error.ValidationError)) throw err;
    const errors = Object.fromEntries(Object.entries(err.errors).map(([path, e]) => [path, e.message]));
    return { valid: false, errors };
  }
}
