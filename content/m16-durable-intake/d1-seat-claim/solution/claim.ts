import { Seat } from './model';
export async function claimSeat(id: string, expectedVersion: number): Promise<boolean> {
  const result = await Seat.updateOne(
    { _id: id, status: 'available', version: expectedVersion },
    { $set: { status: 'reserved' }, $inc: { version: 1 } },
  );
  return result.matchedCount === 1;
}
