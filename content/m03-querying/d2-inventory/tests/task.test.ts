import { expect } from 'expect';
import { resetDb } from '@forge/kit';
import { Product } from '../models/Product';
import { restock, sell, addTag, setPrice } from '../repositories/inventory';

beforeEach(async () => {
  await resetDb();
  await Product.create({ sku: 'KB-01', name: 'Keyboard', stock: 5, price: 89, tags: ['peripherals'] });
});

const stock = async () => (await Product.findOne({ sku: 'KB-01' }).lean())!.stock;

test('restock adds atomically and returns the new stock', async () => {
  expect(await restock('KB-01', 3)).toBe(8);
  expect(await stock()).toBe(8);
});

test('restock works with any SKU casing and returns null for unknown SKUs', async () => {
  expect(await restock('kb-01', 1)).toBe(6);
  expect(await restock('NOPE-1', 1)).toBeNull();
});

test('restock rejects non-positive or fractional quantities without writing', async () => {
  for (const q of [0, -2, 1.5]) await expect(restock('KB-01', q)).rejects.toThrow();
  expect(await stock()).toBe(5);
});

test('concurrent restocks are all counted', async () => {
  await Promise.all(Array.from({ length: 20 }, () => restock('KB-01', 1)));
  expect(await stock()).toBe(25);
}, { hint: 'Use $inc in the database — not read, add in JS, then write.' });

test('sell succeeds when there is enough stock', async () => {
  expect(await sell('KB-01', 2)).toBe(true);
  expect(await stock()).toBe(3);
});

test('sell refuses when there is not enough stock and changes nothing', async () => {
  expect(await sell('KB-01', 6)).toBe(false);
  expect(await stock()).toBe(5);
  expect(await sell('NOPE-1', 1)).toBe(false);
}, { hint: 'Put stock: { $gte: qty } in the filter and check modifiedCount.' });

test('10 concurrent sales of 1 with 5 in stock: exactly 5 succeed, stock ends at 0', async () => {
  const results = await Promise.all(Array.from({ length: 10 }, () => sell('KB-01', 1)));
  expect(results.filter(Boolean)).toHaveLength(5);
  expect(await stock()).toBe(0);
}, { hint: 'A findOne + check + save has a race window. The check must be part of the update filter.' });

test('addTag adds a lowercased tag once', async () => {
  const p: any = await addTag('KB-01', 'Sale');
  expect([...p.tags]).toEqual(['peripherals', 'sale']);
  const again: any = await addTag('KB-01', 'SALE');
  expect([...again.tags]).toEqual(['peripherals', 'sale']);
  expect(await addTag('NOPE-1', 'x')).toBeNull();
}, { hint: '$addToSet — and return the document *after* the update.' });

test('setPrice returns the updated product', async () => {
  const p: any = await setPrice('KB-01', 79);
  expect(p.price).toBe(79);
  expect(await setPrice('NOPE-1', 10)).toBeNull();
}, { hint: 'findOneAndUpdate returns the old document unless you pass returnDocument: "after".' });

test('setPrice rejects negative prices', async () => {
  await expect(setPrice('KB-01', -1)).rejects.toThrow(/price/);
  expect((await Product.findOne({ sku: 'KB-01' }).lean())!.price).toBe(89);
}, { hint: 'Update queries skip validators unless runValidators: true.' });
