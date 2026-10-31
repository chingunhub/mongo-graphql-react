export function affected(graph: Record<string, string[]>, changed: string[]): string[] {
  for (const name of [...changed, ...Object.values(graph).flat()]) {
    if (!Object.hasOwn(graph, name)) throw new Error('Unknown project: ' + name);
  }
  const found = new Set(changed);
  let size = -1;
  while (size !== found.size) {
    size = found.size;
    for (const [name, dependencies] of Object.entries(graph)) {
      if (dependencies.some((d) => found.has(d))) found.add(name);
    }
  }
  return [...found].sort();
}
