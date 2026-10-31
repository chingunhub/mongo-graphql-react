import mongoose, { Schema } from 'mongoose';

const userSchema = new Schema({
  name: { type: String, required: true },
  apiKey: { type: String, required: true, unique: true },
});

export const User = mongoose.model('User', userSchema);
