import mongoose, { Schema } from 'mongoose';

const venueSchema = new Schema({
  name: { type: String, required: true },
  city: { type: String, required: true },
});

export const Venue = mongoose.model('Venue', venueSchema);
