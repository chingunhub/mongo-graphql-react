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
  // TODO: Order.aggregate([...])
  return [];
}

export async function topCustomers(limit = 3): Promise<TopCustomer[]> {
  // TODO
  return [];
}
