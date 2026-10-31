export type RetryInput = {
  attemptsMade: number;
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  kind: 'transient' | 'permanent';
};
export function retryPlan(input: RetryInput): { delayMs: number } | null {
  return null;
}
