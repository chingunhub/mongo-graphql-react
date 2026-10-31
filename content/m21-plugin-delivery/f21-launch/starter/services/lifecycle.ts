export type Running = { url: string; stop: () => Promise<void> };
export type Dependencies = {
  connect: () => Promise<void>;
  ensureIndexes: () => Promise<void>;
  serve: () => Promise<Running>;
  disconnect: () => Promise<void>;
};
export async function boot(deps: Dependencies): Promise<Running> {
  throw Error('TODO: lifecycle');
}
