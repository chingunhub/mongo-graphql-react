import { Order } from './models/Order';
import { Customer } from './models/Customer';
import { revenueByCategory, topCustomers } from './reports/sales';

const [kai, mo] = await Customer.create([
  { name: 'Kai Ito', email: 'kai@shop.dev' },
  { name: 'Mo Reyes', email: 'mo@shop.dev' },
]);

const day = (d: number) => new Date(Date.UTC(2026, 2, d));
await Order.create([
  { customer: kai._id, createdAt: day(2), items: [{ sku: 'KB-1', category: 'keyboards', qty: 2, price: 89 }, { sku: 'C-1', category: 'cables', qty: 1, price: 15 }] },
  { customer: mo._id, createdAt: day(5), items: [{ sku: 'KB-2', category: 'keyboards', qty: 4, price: 89 }] },
  { customer: kai._id, createdAt: day(9), status: 'REFUNDED', items: [{ sku: 'M-1', category: 'mice', qty: 1, price: 40 }] },
]);

// Try building the pipeline one stage at a time and logging what comes out:
console.log(await Order.aggregate([{ $unwind: '$items' }, { $limit: 3 }]));

console.log(await revenueByCategory(day(1), day(31)));
console.log(await topCustomers());
