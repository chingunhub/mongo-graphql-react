import mongoose, { Schema } from 'mongoose';

const teamSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    city: { type: String, default: '' },
    captain: { type: Schema.Types.ObjectId, ref: 'Player', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

// A team's players: players reference their team, so we look them up in reverse.
teamSchema.virtual('players', {
  ref: 'Player',
  localField: 'team',
  foreignField: '_id',
});

export const Team = mongoose.model('Team', teamSchema);
