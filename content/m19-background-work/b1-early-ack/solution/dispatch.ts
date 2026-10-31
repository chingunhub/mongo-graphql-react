export async function dispatch<T, R>(
  event: T,
  deliver: (event: T) => Promise<R>,
  acknowledge: (event: T) => Promise<void>,
): Promise<R> {
  const result = await deliver(event);
  await acknowledge(event);
  return result;
}
