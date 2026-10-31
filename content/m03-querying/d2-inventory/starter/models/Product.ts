import mongoose, { Schema } from 'mongoose';

const productSchema = new Schema(
  {
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true },
    stock: { type: Number, default: 0, min: 0 },
    price: { type: Number, required: true, min: 0 },
    tags: [{ type: String, lowercase: true, trim: true }],
  },
  { timestamps: true },
);

export const Product = mongoose.model('Product', productSchema);
