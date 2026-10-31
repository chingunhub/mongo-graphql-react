import mongoose, { Schema } from 'mongoose';

const customerSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, lowercase: true },
});

export const Customer = mongoose.model('Customer', customerSchema);
