import { Product } from '../models/Product';

export async function restock(sku: string, qty: number): Promise<number | null> {
  // TODO
  return null;
}

export async function sell(sku: string, qty: number): Promise<boolean> {
  // TODO: atomic, never oversell
  return false;
}

export async function addTag(sku: string, tag: string) {
  // TODO
  return null;
}

export async function setPrice(sku: string, price: number) {
  // TODO
  return null;
}
