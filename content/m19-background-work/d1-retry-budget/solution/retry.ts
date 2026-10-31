export type RetryInput = {
  attemptsMade: number;
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  kind: 'transient' | 'permanent';
};
export function retryPlan(input: RetryInput): { delayMs: number } | null {
  const { attemptsMade, maxAttempts, baseDelay, maxDelay, kind } = input;
  if (
    ![attemptsMade, maxAttempts].every((x) => Number.isInteger(x) && x > 0) ||
    ![baseDelay, maxDelay].every((x) => Number.isFinite(x) && x > 0) ||
    maxDelay < baseDelay ||
    !['transient', 'permanent'].includes(kind)
  )
    throw Error('Invalid retry policy');
  if (kind === 'permanent' || attemptsMade >= maxAttempts) return null;
  return { delayMs: Math.min(maxDelay, baseDelay * 2 ** (attemptsMade - 1)) };
}
