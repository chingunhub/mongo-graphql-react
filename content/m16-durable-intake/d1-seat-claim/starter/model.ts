import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['available', 'reserved'],
    default: 'available',
  },
  version: { type: Number, default: 0 },
});
export const Seat = mongoose.models.Seat || mongoose.model('Seat', schema);
