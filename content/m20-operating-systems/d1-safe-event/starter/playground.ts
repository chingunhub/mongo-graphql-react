import { operationalEvent } from './event';
console.log(
  operationalEvent({
    requestId: 'r1',
    tenant: 'north',
    operation: 'dispatch',
    outcome: 'error',
    durationMs: 12,
    headers: { authorization: 'do not log' },
  }),
);
