import mongoose, { Schema } from 'mongoose';

const noteSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: [100, 'Title is too long'] },
    body: { type: String, default: '', maxlength: [5000, 'Body is too long'] },
    shared: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Note = mongoose.model('Note', noteSchema);
