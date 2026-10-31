import { useEffect, useState } from 'react';
export type Snapshot = { tickets: number; pending: number; activities: number };
export type OperationsApi = {
  report(): Promise<Snapshot>;
  dispatch(simulateFailure: boolean): Promise<{ delivered: number; failed: number }>;
};
export function OperationsPanel({ api }: { api: OperationsApi }) {
  return (
    <section aria-label="Operations">
      <h2>Delivery operations</h2>
      <p>TODO: connect the operations API.</p>
    </section>
  );
}
