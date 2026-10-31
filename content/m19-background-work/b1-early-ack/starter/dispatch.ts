export async function dispatch<T, R>(
  event: T,
  deliver: (event: T) => Promise<R>,
  acknowledge: (event: T) => Promise<void>,
): Promise<R> {
  await acknowledge(event);
  return deliver(event);
}
