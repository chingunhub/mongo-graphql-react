import React from 'react';
import { createRoot } from 'react-dom/client';
import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { SupportInbox } from './SupportInbox';
let tickets: any[] = [];
const client = new ApolloClient({
  cache: new InMemoryCache(),
  link: new ApolloLink(
    () =>
      new Observable((observer) => {
        const timer = setTimeout(() => {
          observer.next({ data: { tickets: [...tickets] } });
          observer.complete();
        }, 350);
        return () => clearTimeout(timer);
      }),
  ),
});
const api = {
  accept: async (input: any) => {
    await new Promise((r) => setTimeout(r, 250));
    const found = tickets.find((t) => t.source === input.sourceId);
    if (found) return found;
    const ticket = {
      __typename: 'Ticket',
      id: String(tickets.length + 1),
      tenant: 'preview',
      subject: input.subject,
      priority: 'normal',
      version: 0,
      contact: null,
      source: input.sourceId,
    };
    tickets = [...tickets, ticket];
    return ticket;
  },
  triage: async (input: any) => {
    const ticket = tickets.find((t) => t.id === input.ticketId);
    if (!ticket || ticket.version !== input.expectedVersion) throw Error('STALE_VERSION');
    tickets = tickets.map((t) =>
      t === ticket ? { ...t, priority: input.priority, version: t.version + 1 } : t,
    );
    return {};
  },
};
createRoot(document.getElementById('root')!).render(
  <ApolloProvider client={client}>
    <p>Isolated UI fixture · no project data is changed</p>
    <SupportInbox api={api} changed={() => console.log('Intake accepted; refresh the operations report')} />
  </ApolloProvider>,
);
