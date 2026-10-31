import mongoose, { Schema } from 'mongoose';

const eventSchema = new Schema({
  title: { type: String, required: true },
  startsAt: { type: Date, required: true },
  venue: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
});

export const Event = mongoose.model('Event', eventSchema);
