import { useEffect, useMemo, useState } from 'react';
import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';
import { ApolloProvider, useQuery } from '@apollo/client/react';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { TriageRouter } from '../services/triage';
import type { TicketsQuery } from './generated/graphql';
import { OperationsPanel, type OperationsApi } from './OperationsPanel';
import { TICKETS } from './operations';
function Inbox({ headers, changed }: { headers: Record<string, string>; changed: () => void }) {
  const { data, loading, error, refetch } = useQuery<TicketsQuery>(TICKETS);
  const [subject, setSubject] = useState('');
  const [sourceId, setSourceId] = useState('web-1');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const trpc = useMemo(
    () =>
      createTRPCClient<TriageRouter>({
        links: [
          httpBatchLink({
            url: new URL('./trpc', location.href).href,
            headers,
          }),
        ],
      }),
    [headers],
  );
  async function accept() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('./api/intake', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ sourceId, subject, contactId: 'c1' }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
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
      await trpc.triage.mutate({
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
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What happened?" required />
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
  const client = useMemo(
    () =>
      new ApolloClient({
        link: new HttpLink({
          uri: new URL('./graphql', location.href).href,
          headers,
        }),
        cache: new InMemoryCache({
          typePolicies: {
            Contact: { keyFields: ['tenant', 'id'] },
            Ticket: { keyFields: ['tenant', 'id'] },
          },
        }),
      }),
    [headers],
  );
  useEffect(() => () => client.stop(), [client]);
  const api = useMemo<OperationsApi>(
    () => ({
      report: async () => {
        const res = await fetch('./api/operations', { headers });
        const data = await res.json();
        if (!res.ok) throw Error(data.error);
        return data;
      },
      dispatch: async (simulateFailure) => {
        const res = await fetch('./api/dispatch', {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({ simulateFailure }),
        });
        const data = await res.json();
        if (!res.ok) throw Error(data.error);
        return data;
      },
    }),
    [headers],
  );
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
      <ApolloProvider client={client}>
        <Inbox key={tenant + role} headers={headers} changed={() => setRevision((r) => r + 1)} />
      </ApolloProvider>
      <OperationsPanel key={tenant + role + revision} api={api} />
      <footer>Tickets → Federation → contacts · tRPC triage · durable event → activity receipt</footer>
    </main>
  );
}
