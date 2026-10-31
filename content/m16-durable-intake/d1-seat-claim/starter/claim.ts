import { Seat } from './model';
export async function claimSeat(id: string, expectedVersion: number): Promise<boolean> {
  // TODO: atomic compare-and-set.
  return false;
}
