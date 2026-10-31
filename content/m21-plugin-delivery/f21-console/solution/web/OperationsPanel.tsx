import { useEffect, useState } from 'react';
export type Snapshot = { tickets: number; pending: number; activities: number };
export type OperationsApi = {
  report(): Promise<Snapshot>;
  dispatch(simulateFailure: boolean): Promise<{ delivered: number; failed: number }>;
};
export function OperationsPanel({ api }: { api: OperationsApi }) {
  const [report, setReport] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setError('');
    setMessage('');
    api
      .report()
      .then((value) => {
        if (!cancelled) setReport(value);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, [api, revision]);
  async function dispatch(simulateFailure: boolean) {
    setBusy(true);
    setError('');
    try {
      const result = await api.dispatch(simulateFailure);
      setReport(await api.report());
      setMessage(result.failed ? result.failed + ' event(s) still pending' : result.delivered + ' event(s) delivered');
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Operations">
      <h2>Delivery operations</h2>
      {!report && !error && <p role="status">Loading operations…</p>}
      {error && <p role="alert">{error}</p>}
      {report && (
        <dl className="ops-counts">
          <div>
            <dt>Tickets</dt>
            <dd>{report.tickets}</dd>
          </div>
          <div>
            <dt>Pending</dt>
            <dd>{report.pending}</dd>
          </div>
          <div>
            <dt>Activities</dt>
            <dd>{report.activities}</dd>
          </div>
        </dl>
      )}
      {message && <p role="status">{message}</p>}
      <div className="actions">
        <button disabled={busy || !report} onClick={() => void dispatch(false)}>
          Deliver pending
        </button>
        <button disabled={busy || !report} onClick={() => void dispatch(true)}>
          Simulate outage
        </button>
        <button disabled={busy} onClick={() => setRevision((x) => x + 1)}>
          Refresh
        </button>
      </div>
    </section>
  );
}
