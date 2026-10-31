import mongoose, { Schema } from 'mongoose';

const expenseSchema = new Schema({
  title: { type: String, required: true },
  amountCents: { type: Number, required: true, min: 0 },
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

export const Expense = mongoose.model('Expense', expenseSchema);
