// In the project explorer, compare services/queue-delivery.ts with runtime/queue.ts.
// Which file chooses resource implementations? Which owns acknowledgement and cleanup?
console.log(
  'Use Submit for deterministic readiness/failure cases; use the live Memurai profile for transport.',
);
