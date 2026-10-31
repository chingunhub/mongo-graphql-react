import mongoose, { Schema } from 'mongoose';

const userSchema = new Schema({
  name: { type: String, required: true },
  token: { type: String, required: true, unique: true },
});

export const User = mongoose.model('User', userSchema);
