import { expect } from 'expect';
import { resetDb, countQueries } from '@forge/kit';
import { Order } from '../models/Order';
import { Customer } from '../models/Customer';
import { revenueByCategory, topCustomers } from '../reports/sales';

const day = (d: number) => new Date(Date.UTC(2026, 2, d));
let kai: any, mo: any, lee: any;

beforeEach(async () => {
  await resetDb();
  [kai, mo, lee] = await Customer.create([
    { name: 'Kai Ito', email: 'kai@shop.dev' },
    { name: 'Mo Reyes', email: 'mo@shop.dev' },
    { name: 'Lee Park', email: 'lee@shop.dev' },
  ]);
  await Order.create([
    // two keyboard lines in one order: must count as ONE order for keyboards
    { customer: kai._id, createdAt: day(2), items: [
      { sku: 'KB-1', category: 'keyboards', qty: 1, price: 89 },
      { sku: 'KB-9', category: 'keyboards', qty: 1, price: 89 },
      { sku: 'C-1', category: 'cables', qty: 2, price: 15 },
    ] },
    { customer: mo._id, createdAt: day(5), items: [{ sku: 'KB-2', category: 'keyboards', qty: 4, price: 89 }] },
    { customer: lee._id, createdAt: day(6), items: [{ sku: 'C-2', category: 'cables', qty: 1, price: 15 }] },
    // refunded: ignored everywhere
    { customer: kai._id, createdAt: day(9), status: 'REFUNDED', items: [{ sku: 'M-1', category: 'mice', qty: 1, price: 40 }] },
    // outside March window (April 1st) but paid
    { customer: kai._id, createdAt: new Date(Date.UTC(2026, 3, 1)), items: [{ sku: 'KB-3', category: 'keyboards', qty: 3, price: 100 }] },
  ]);
});

const march = () => revenueByCategory(day(1), new Date(Date.UTC(2026, 3, 1)));

test('revenue, units and distinct orders per category, sorted by revenue', async () => {
  expect(await march()).toEqual([
    { category: 'keyboards', revenue: 534, units: 6, orders: 2 },
    { category: 'cables', revenue: 45, units: 3, orders: 2 },
  ]);
}, { hint: 'Unwind items, $sum a $multiply of qty and price, and $addToSet the order _id to count distinct orders.' });

test('the date window is [from, to): the end date is exclusive', async () => {
  const r = await march();
  expect(r.find((c) => c.category === 'keyboards')!.units).toBe(6);
}, { hint: 'An order created exactly at `to` must not be included: $lt, not $lte.' });

test('refunded orders are excluded', async () => {
  const r = await march();
  expect(r.map((c) => c.category)).not.toContain('mice');
});

test('each row has exactly category, revenue, units, orders', async () => {
  const [row] = await march();
  expect(Object.keys(row).sort()).toEqual(['category', 'orders', 'revenue', 'units']);
}, { hint: 'In $project, set _id: 0 and rename _id to category.' });

test('an empty window gives []', async () => {
  expect(await revenueByCategory(new Date(Date.UTC(2020, 0, 1)), new Date(Date.UTC(2020, 1, 1)))).toEqual([]);
});

test('revenueByCategory is a single aggregation (no loading orders into Node)', async () => {
  const { count, ops } = await countQueries(() => march());
  expect(count).toBe(1);
  expect(ops[0].method).toBe('aggregate');
});

test('topCustomers: spent on paid orders (all time), with names, sorted', async () => {
  expect(await topCustomers()).toEqual([
    { customerId: String(kai._id), name: 'Kai Ito', spent: 508, orders: 2 },
    { customerId: String(mo._id), name: 'Mo Reyes', spent: 356, orders: 1 },
    { customerId: String(lee._id), name: 'Lee Park', spent: 15, orders: 1 },
  ]);
}, { hint: 'Group by $customer, then $lookup from "customers" and $unwind it. $toString for the id.' });

test('topCustomers respects the limit', async () => {
  const r = await topCustomers(1);
  expect(r.map((c) => c.name)).toEqual(['Kai Ito']);
});

test('the date window includes from itself', async () => {
  await Order.create({ customer: kai._id, createdAt: day(1), items: [{ sku: 'M-2', category: 'mice', qty: 1, price: 40 }] });
  expect((await march()).map((c: any) => c.category)).toContain('mice');
}, { hint: 'The window is [from, to): the start is inside, the end is not.' });
