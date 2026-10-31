export function operationalEvent(input: unknown) {
  if (!input || typeof input !== 'object') throw Error('Invalid operational event');
  const data = input as Record<string, unknown>;
  const { requestId, tenant, operation, outcome, durationMs } = data;
  if (
    ![requestId, tenant, operation].every((v) => typeof v === 'string' && v.trim()) ||
    !['ok', 'error'].includes(outcome as string) ||
    typeof durationMs !== 'number' ||
    !Number.isFinite(durationMs) ||
    durationMs < 0
  )
    throw Error('Invalid operational event');
  return { requestId, tenant, operation, outcome, durationMs };
}
