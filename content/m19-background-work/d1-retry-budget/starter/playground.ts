import { retryPlan } from './retry';
for (let attempt = 1; attempt <= 4; attempt++)
  console.log(
    attempt,
    retryPlan({
      attemptsMade: attempt,
      maxAttempts: 4,
      baseDelay: 250,
      maxDelay: 700,
      kind: 'transient',
    }),
  );
