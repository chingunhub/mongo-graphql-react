const entries = new Map<string, { value: unknown; expires: number }>();

const keyOf = (name: string, args: unknown[]) => `${name}:${JSON.stringify(args)}`;

export async function memo<T>(name: string, args: unknown[], ttlMs: number, load: () => Promise<T>) {
  const key = keyOf(name, args);
  const hit = entries.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await load();
  entries.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

export const clearMemo = (name: string, args: unknown[] = []) => {
  entries.delete(keyOf(name, args));
};
