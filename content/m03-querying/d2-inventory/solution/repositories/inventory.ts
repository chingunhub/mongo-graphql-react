import { Product } from '../models/Product';

export async function restock(sku: string, qty: number): Promise<number | null> {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error('qty must be a positive whole number');
  const product = await Product.findOneAndUpdate({ sku }, { $inc: { stock: qty } }, { returnDocument: 'after' });
  return product ? product.stock : null;
}

export async function sell(sku: string, qty: number): Promise<boolean> {
  if (!Number.isInteger(qty) || qty <= 0) return false;
  // The condition and the change happen together, so concurrent sales can't oversell.
  const res = await Product.updateOne({ sku, stock: { $gte: qty } }, { $inc: { stock: -qty } });
  return res.modifiedCount === 1;
}

export async function addTag(sku: string, tag: string) {
  return Product.findOneAndUpdate({ sku }, { $addToSet: { tags: tag } }, { returnDocument: 'after' });
}

export async function setPrice(sku: string, price: number) {
  return Product.findOneAndUpdate(
    { sku },
    { $set: { price } },
    { returnDocument: 'after', runValidators: true },
  );
}
