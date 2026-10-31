import { useEffect, useMemo, useState } from 'react';
import { ApolloProvider } from '@apollo/client/react';
import { OperationsPanel } from './OperationsPanel';
import { createSession } from './session';
import { SupportInbox } from './SupportInbox';
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
        <SupportInbox key={tenant + role} api={session.inbox} changed={() => setRevision((r) => r + 1)} />
      </ApolloProvider>
      <OperationsPanel key={tenant + role + revision} api={session.operations} />
      <footer>Tickets → Federation → contacts · tRPC triage · durable event → activity receipt</footer>
    </main>
  );
}
