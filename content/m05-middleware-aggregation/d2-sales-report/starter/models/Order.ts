import mongoose, { Schema } from 'mongoose';

const lineItemSchema = new Schema(
  {
    sku: { type: String, required: true },
    category: { type: String, required: true, lowercase: true },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    status: { type: String, enum: ['PAID', 'REFUNDED'], default: 'PAID' },
    items: { type: [lineItemSchema], default: [] },
  },
  { timestamps: true },
);

export const Order = mongoose.model('Order', orderSchema);
