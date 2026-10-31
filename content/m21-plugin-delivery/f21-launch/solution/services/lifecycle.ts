export type Running = { url: string; stop: () => Promise<void> };
export type Dependencies = {
  connect: () => Promise<void>;
  ensureIndexes: () => Promise<void>;
  serve: () => Promise<Running>;
  disconnect: () => Promise<void>;
};
export async function boot(deps: Dependencies): Promise<Running> {
  let running: Running | undefined;
  try {
    await deps.connect();
    await deps.ensureIndexes();
    running = await deps.serve();
  } catch (error) {
    try {
      await deps.disconnect();
    } catch {}
    throw error;
  }
  let stopping: Promise<void> | undefined;
  return {
    url: running.url,
    stop: () =>
      (stopping ??= (async () => {
        try {
          await running!.stop();
        } finally {
          await deps.disconnect();
        }
      })()),
  };
}
