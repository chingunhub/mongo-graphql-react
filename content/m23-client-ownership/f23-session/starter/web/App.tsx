import { useEffect, useMemo, useState } from 'react';
import { ApolloProvider, useQuery } from '@apollo/client/react';
import type { TicketsQuery } from './generated/graphql';
import { OperationsPanel } from './OperationsPanel';
import { TICKETS } from './operations';
import { createSession } from './session';
import type { InboxApi } from './session-contract';
function Inbox({ api, changed }: { api: InboxApi; changed: () => void }) {
  const { data, loading, error, refetch } = useQuery<TicketsQuery>(TICKETS);
  const [subject, setSubject] = useState('');
  const [sourceId, setSourceId] = useState('web-1');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function accept() {
    setBusy(true);
    setMessage('');
    try {
      const result = await api.accept({ sourceId, subject, contactId: 'c1' });
      setMessage('Accepted ' + result.id + '. Reusing the source key returns the original ticket.');
      await refetch();
      changed();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function raise(ticket: TicketsQuery['tickets'][number]) {
    setBusy(true);
    setMessage('');
    try {
      await api.triage({
        ticketId: ticket.id,
        expectedVersion: ticket.version,
        priority: 'high',
      });
      await refetch();
      setMessage('Priority updated');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Support inbox</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void accept();
        }}
      >
        <label>
          Source key
          <input value={sourceId} onChange={(e) => setSourceId(e.target.value)} required />
        </label>
        <label>
          Subject
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="What happened?"
            required
          />
        </label>
        <button disabled={busy}>Accept ticket</button>
      </form>
      {message && <p role="status">{message}</p>}
      {loading && <p>Loading tickets…</p>}
      {error && <p role="alert">{error.message}</p>}
      <button disabled={busy || loading} onClick={() => void refetch()}>
        Refresh inbox
      </button>
      <div className="tickets">
        {data?.tickets.map((ticket) => (
          <article key={ticket.id}>
            <div>
              <strong>{ticket.subject}</strong>
              <p>
                {ticket.contact?.name ?? 'Contact unavailable'} · {ticket.priority} · version {ticket.version}
              </p>
            </div>
            <button disabled={busy} onClick={() => void raise(ticket)}>
              Raise priority
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
export function RelaydeskApp() {
  const [tenant, setTenant] = useState('north');
  const [role, setRole] = useState('agent');
  const [revision, setRevision] = useState(0);
  const headers = useMemo(
    () => ({
      authorization: 'Bearer ' + tenant + '-' + role,
      'x-relay-tenant': tenant,
    }),
    [tenant, role],
  );
  const session = useMemo(
    () => createSession({ baseUrl: new URL('./', location.href).href, headers }),
    [headers],
  );
  useEffect(() => () => session.stop(), [session]);
  return (
    <main className="relay-app">
      <header>
        <span className="eyebrow">FORGE ACADEMY · CONNECTED SYSTEMS</span>
        <h1>Relaydesk</h1>
        <p>One ticket. Several owners. Every boundary observable.</p>
        <div className="identity">
          <label>
            Organization
            <select value={tenant} onChange={(e) => setTenant(e.target.value)}>
              <option value="north">North</option>
              <option value="south">South</option>
            </select>
          </label>
          <label>
            Demo role
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="agent">Agent</option>
              <option value="reader">Reader</option>
            </select>
          </label>
          <span>Synthetic local accounts</span>
        </div>
      </header>
      <ApolloProvider client={session.client}>
        <Inbox key={tenant + role} api={session.inbox} changed={() => setRevision((r) => r + 1)} />
      </ApolloProvider>
      <OperationsPanel key={tenant + role + revision} api={session.operations} />
      <footer>Tickets → Federation → contacts · tRPC triage · durable event → activity receipt</footer>
    </main>
  );
}
