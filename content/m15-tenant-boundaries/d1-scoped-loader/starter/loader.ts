import DataLoader from 'dataloader';
export type Booking = { id: string; tenant: string; title: string };
export type FetchBookings = (tenant: string, ids: readonly string[]) => Promise<Booking[]>;
export function bookingLoader(tenant: string, fetchBookings: FetchBookings) {
  return new DataLoader<string, Booking | null>(async (ids) => {
    // TODO: one scoped fetch, then restore input order and missing values.
    return ids.map(() => null);
  });
}
