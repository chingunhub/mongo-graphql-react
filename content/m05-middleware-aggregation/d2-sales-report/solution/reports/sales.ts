import { Order } from '../models/Order';
import '../models/Customer';

export interface CategoryRevenue {
  category: string;
  revenue: number;
  units: number;
  orders: number;
}

export interface TopCustomer {
  customerId: string;
  name: string;
  spent: number;
  orders: number;
}

export async function revenueByCategory(from: Date, to: Date): Promise<CategoryRevenue[]> {
  return Order.aggregate([
    { $match: { status: 'PAID', createdAt: { $gte: from, $lt: to } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.category',
        revenue: { $sum: { $multiply: ['$items.qty', '$items.price'] } },
        units: { $sum: '$items.qty' },
        orderIds: { $addToSet: '$_id' },
      },
    },
    { $project: { _id: 0, category: '$_id', revenue: 1, units: 1, orders: { $size: '$orderIds' } } },
    { $sort: { revenue: -1, category: 1 } },
  ]);
}

export async function topCustomers(limit = 3): Promise<TopCustomer[]> {
  return Order.aggregate([
    { $match: { status: 'PAID' } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$customer',
        spent: { $sum: { $multiply: ['$items.qty', '$items.price'] } },
        orderIds: { $addToSet: '$_id' },
      },
    },
    { $sort: { spent: -1, _id: 1 } },
    { $limit: limit },
    { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
    { $unwind: '$customer' },
    {
      $project: {
        _id: 0,
        customerId: { $toString: '$_id' },
        name: '$customer.name',
        spent: 1,
        orders: { $size: '$orderIds' },
      },
    },
  ]);
}
