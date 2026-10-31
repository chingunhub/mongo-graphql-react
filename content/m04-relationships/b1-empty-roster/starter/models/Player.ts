import mongoose, { Schema } from 'mongoose';

const playerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    number: { type: Number, required: true, min: 0, max: 99 },
    team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
  },
  { timestamps: true },
);

playerSchema.index({ team: 1, number: 1 }, { unique: true });

export const Player = mongoose.model('Player', playerSchema);
