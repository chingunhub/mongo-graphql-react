export type Plugin = { name: string; version: number; requires: string[] };
export function orderPlugins(plugins: Plugin[]): string[] {
  const byName = new Map<string, Plugin>();
  for (const plugin of plugins) {
    if (byName.has(plugin.name)) throw new Error('Duplicate plugin: ' + plugin.name);
    if (plugin.version !== 1) throw new Error('Unsupported version: ' + plugin.name);
    byName.set(plugin.name, plugin);
  }
  const active = new Set<string>();
  const done = new Set<string>();
  const result: string[] = [];
  function visit(name: string) {
    const plugin = byName.get(name);
    if (!plugin) throw new Error('Missing dependency: ' + name);
    if (active.has(name)) throw new Error('Dependency cycle: ' + name);
    if (done.has(name)) return;
    active.add(name);
    for (const dependency of [...plugin.requires].sort()) visit(dependency);
    active.delete(name);
    done.add(name);
    result.push(name);
  }
  for (const name of [...byName.keys()].sort()) visit(name);
  return result;
}
