import mongoose, { Schema } from 'mongoose';

const trackSchema = new Schema({
  title: { type: String, required: true },
  seconds: { type: Number, required: true },
  album: { type: Schema.Types.ObjectId, ref: 'Album', required: true },
});

export const Track = mongoose.model('Track', trackSchema);
