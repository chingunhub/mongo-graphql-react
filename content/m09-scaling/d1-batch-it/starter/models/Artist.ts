import mongoose, { Schema } from 'mongoose';

export const Artist = mongoose.model('Artist', new Schema({ name: { type: String, required: true } }));
