import DataLoader from 'dataloader';
type Row = { id: string; title: string };
export function createContext(tenant: string, fetchRows: (tenant: string, ids: readonly string[]) => Promise<Row[]>) {
  const loader = new DataLoader<string, Row | null>(async (ids) => {
    const rows = await fetchRows(tenant, ids);
    return ids.map((id) => rows.find((row) => row.id === id) ?? null);
  });
  return { loadRecord: (id: string) => loader.load(id) };
}
