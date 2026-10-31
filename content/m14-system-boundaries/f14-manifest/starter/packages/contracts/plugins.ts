export type Plugin = { name: string; version: number; requires: string[] };
export function orderPlugins(plugins: Plugin[]): string[] {
  // TODO: validate and return dependency-first names.
  return [];
}
