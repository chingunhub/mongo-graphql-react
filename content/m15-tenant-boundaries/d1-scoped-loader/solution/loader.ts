import DataLoader from 'dataloader';
export type Booking = { id: string; tenant: string; title: string };
export type FetchBookings = (tenant: string, ids: readonly string[]) => Promise<Booking[]>;
export function bookingLoader(tenant: string, fetchBookings: FetchBookings) {
  return new DataLoader<string, Booking | null>(async (ids) => {
    const rows = await fetchBookings(tenant, ids);
    const byId = new Map(rows.filter((row) => row.tenant === tenant).map((row) => [row.id, row]));
    return ids.map((id) => byId.get(id) ?? null);
  });
}
