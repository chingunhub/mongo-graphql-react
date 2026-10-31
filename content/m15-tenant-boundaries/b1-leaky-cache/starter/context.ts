import DataLoader from 'dataloader';
type Row = { id: string; title: string };
let activeTenant = '';
let shared: DataLoader<string, Row | null> | undefined;
export function createContext(tenant: string, fetchRows: (tenant: string, ids: readonly string[]) => Promise<Row[]>) {
  activeTenant = tenant;
  shared ??= new DataLoader(async (ids) => {
    const rows = await fetchRows(activeTenant, ids);
    return ids.map((id) => rows.find((row) => row.id === id) ?? null);
  });
  return { loadRecord: (id: string) => shared!.load(id) };
}
