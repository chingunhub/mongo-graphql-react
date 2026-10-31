import mongoose, { Schema } from 'mongoose';

const albumSchema = new Schema({
  title: { type: String, required: true },
  year: { type: Number, required: true },
  artist: { type: Schema.Types.ObjectId, ref: 'Artist', required: true },
});

export const Album = mongoose.model('Album', albumSchema);
