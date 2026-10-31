export async function loadPlugins(names: string[], importPlugin: (name: string) => Promise<unknown>) {
  return Promise.all(
    names.map(async (name) => {
      let mod: unknown;
      try {
        mod = await importPlugin(name);
      } catch {
        return { name, status: 'failed', reason: 'load failed' };
      }
      if (
        !mod ||
        typeof mod !== 'object' ||
        (mod as any).version !== 1 ||
        typeof (mod as any).title !== 'string' ||
        !(mod as any).title.trim()
      )
        return { name, status: 'failed', reason: 'incompatible plugin' };
      return { name, status: 'ready', title: (mod as any).title };
    }),
  );
}
