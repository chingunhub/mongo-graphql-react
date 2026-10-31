import React from 'react';
import { expect } from 'expect';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { SupportInbox } from '../web/SupportInbox';
let clients: ApolloClient[] = [];
afterEach(() => {
  cleanup();
  for (const client of clients) client.stop();
  clients = [];
});
const ticket = (overrides: any = {}) => ({
  __typename: 'Ticket',
  id: 't1',
  tenant: 'north',
  subject: 'Printer offline',
  priority: 'normal',
  version: 4,
  contact: { __typename: 'Contact', id: 'c1', tenant: 'north', name: 'Nara' },
  ...overrides,
});
function harness(
  options: {
    query?: () => Promise<any[]>;
    api?: any;
    changed?: () => void;
  } = {},
) {
  let reads = 0;
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(
      () =>
        new Observable((observer) => {
          let alive = true;
          reads++;
          Promise.resolve()
            .then(() => (options.query ? options.query() : [ticket()]))
            .then(
              (tickets) => {
                if (alive) {
                  observer.next({ data: { tickets } });
                  observer.complete();
                }
              },
              (error) => {
                if (alive) observer.error(error);
              },
            );
          return () => {
            alive = false;
          };
        }),
    ),
  });
  clients.push(client);
  const api = options.api ?? {
    accept: async () => ({ id: 't2', subject: 'new', version: 0 }),
    triage: async () => ({}),
  };
  const changed = options.changed ?? (() => {});
  const view = render(
    <ApolloProvider client={client}>
      <SupportInbox api={api} changed={changed} />
    </ApolloProvider>,
  );
  return {
    client,
    api,
    reads: () => reads,
    rerender: (next: any) =>
      view.rerender(
        <ApolloProvider client={client}>
          <SupportInbox api={next} changed={changed} />
        </ApolloProvider>,
      ),
  };
}
function fill(subject = '  New problem  ', source = '  mail-17  ') {
  fireEvent.change(screen.getByLabelText('Source key'), {
    target: { value: source },
  });
  fireEvent.change(screen.getByLabelText('Subject'), {
    target: { value: subject },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Accept ticket' }));
}
test('shows loading, then a genuinely empty result', async () => {
  let resolve!: (x: any[]) => void;
  harness({ query: () => new Promise((r) => (resolve = r)) });
  expect(screen.getByText(/Loading tickets/)).toBeTruthy();
  await waitFor(() => expect(resolve).toBeDefined());
  await act(async () => resolve([]));
  expect(await screen.findByText('No tickets yet')).toBeTruthy();
  expect(screen.queryByText(/Loading tickets/)).toBeNull();
});
test('"No tickets yet" is only ever said about a successful, empty read', async () => {
  let fail!: (e: Error) => void;
  harness({ query: () => new Promise((_r, j) => (fail = j)) });
  expect(screen.queryByText('No tickets yet')).toBeNull();
  await waitFor(() => expect(fail).toBeDefined());
  await act(async () => fail(Error('Read offline')));
  await screen.findByRole('alert');
  expect(screen.queryByText('No tickets yet')).toBeNull();
});
test('renders returned subject, contact fallback, priority and actual version', async () => {
  harness({ query: async () => [ticket({ contact: null })] });
  await screen.findByText('Printer offline');
  expect(screen.getByText(/Contact unavailable.*normal.*version 4/)).toBeTruthy();
});
test('query failure is visible and Refresh inbox recovers', async () => {
  let broken = true;
  harness({
    query: async () => {
      if (broken) throw Error('Read offline');
      return [ticket()];
    },
  });
  expect((await screen.findByRole('alert')).textContent).toContain('Read offline');
  broken = false;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh inbox' }));
  await screen.findByText('Printer offline');
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
});
test('whitespace-only fields fail validation without calling intake', async () => {
  let calls = 0;
  harness({
    api: {
      accept: async () => {
        calls++;
        return { id: 'x' };
      },
      triage: async () => ({}),
    },
  });
  await screen.findByText('Printer offline');
  fill('   ', ' ');
  await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(2));
  expect(calls).toBe(0);
});
test('accept trims fields, preserves the retry key and notifies before follow-up read completes', async () => {
  const inputs: any[] = [];
  let notifications = 0,
    reads = 0,
    finish!: (x: any[]) => void;
  harness({
    changed: () => notifications++,
    api: {
      accept: async (input: any) => {
        inputs.push(input);
        return { id: 't2', subject: input.subject, version: 0 };
      },
      triage: async () => ({}),
    },
    query: async () => {
      reads++;
      if (reads === 1) return [ticket()];
      return new Promise((r) => (finish = r));
    },
  });
  await screen.findByText('Printer offline');
  fill();
  await waitFor(() => expect(notifications).toBe(1));
  expect(inputs).toEqual([{ sourceId: 'mail-17', subject: 'New problem', contactId: 'c1' }]);
  expect((screen.getByLabelText('Source key') as HTMLInputElement).value.trim()).toBe('mail-17');
  await waitFor(() => expect(finish).toBeDefined());
  await act(async () => finish([ticket(), ticket({ id: 't2', subject: 'New problem' })]));
  expect(await screen.findByText('New problem')).toBeTruthy();
  expect(screen.getByText(/Accepted t2/)).toBeTruthy();
});
test('intake failure keeps the draft, reports the failure and allows an idempotent retry', async () => {
  let fail = true,
    calls = 0,
    notifications = 0;
  harness({
    changed: () => notifications++,
    api: {
      accept: async () => {
        calls++;
        if (fail) throw Error('Write offline');
        return { id: 't2', subject: 'new', version: 0 };
      },
      triage: async () => ({}),
    },
  });
  await screen.findByText('Printer offline');
  fill();
  expect((await screen.findByRole('alert')).textContent).toContain('Write offline');
  expect(notifications).toBe(0);
  expect((screen.getByLabelText('Subject') as HTMLInputElement).value.trim()).toBe('New problem');
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Accept ticket' }));
  await screen.findByText(/Accepted t2/);
  expect(calls).toBe(2);
  expect(notifications).toBe(1);
});
test('triage uses displayed version; conflict remains visible until refresh; success refetches', async () => {
  let version = 4,
    conflict = true;
  const sent: any[] = [];
  harness({
    query: async () => [ticket({ version, priority: version > 4 ? 'high' : 'normal' })],
    api: {
      accept: async () => ({}),
      triage: async (input: any) => {
        sent.push(input);
        if (conflict) throw Error('STALE_VERSION');
        version++;
        return {};
      },
    },
  });
  await screen.findByText('Printer offline');
  fireEvent.click(screen.getByRole('button', { name: 'Raise priority' }));
  expect((await screen.findByRole('alert')).textContent).toContain('STALE_VERSION');
  expect(screen.getByText(/version 4/)).toBeTruthy();
  expect(sent[0]).toEqual({
    ticketId: 't1',
    expectedVersion: 4,
    priority: 'high',
  });
  version = 5;
  conflict = false;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh inbox' }));
  await screen.findByText(/version 5/);
  fireEvent.click(screen.getByRole('button', { name: 'Raise priority' }));
  await screen.findByText(/version 6/);
  expect(sent[1].expectedVersion).toBe(5);
});
test('pending command disables submission, triage and refresh until it settles', async () => {
  let release!: (x: any) => void;
  harness({
    api: {
      accept: () => new Promise((r) => (release = r)),
      triage: async () => ({}),
    },
  });
  await screen.findByText('Printer offline');
  fill();
  await waitFor(() => expect(release).toBeDefined());
  for (const name of ['Accept ticket', 'Raise priority', 'Refresh inbox'])
    expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => release({ id: 't2', subject: 'new', version: 0 }));
  await waitFor(() =>
    expect(
      (
        screen.getByRole('button', {
          name: 'Accept ticket',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
});
test('two submits in the same moment send one command', async () => {
  const sent: any[] = [];
  let release!: (x: any) => void;
  harness({
    api: {
      accept: (input: any) => {
        sent.push(input);
        return new Promise((r) => (release = r));
      },
      triage: async () => ({}),
    },
  });
  await screen.findByText('Printer offline');
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Accept ticket' }));
  await waitFor(() => expect(sent).toHaveLength(1));
  await new Promise((r) => setTimeout(r, 20));
  expect(sent).toHaveLength(1);
  await act(async () => release({ id: 't2', subject: 'new', version: 0 }));
});
test('late success from an obsolete API cannot notify or refresh the new view', async () => {
  let release!: (x: any) => void,
    changed = 0;
  const h = harness({
    changed: () => changed++,
    api: {
      accept: () => new Promise((r) => (release = r)),
      triage: async () => ({}),
    },
  });
  await screen.findByText('Printer offline');
  fill();
  await waitFor(() => expect(release).toBeDefined());
  h.rerender({
    accept: async () => ({ id: 'south' }),
    triage: async () => ({}),
  });
  const before = h.reads();
  await act(async () => release({ id: 'old-north', subject: 'old', version: 0 }));
  expect(changed).toBe(0);
  expect(h.reads()).toBe(before);
  expect(screen.queryByText(/Accepted old-north/)).toBeNull();
  expect((screen.getByRole('button', { name: 'Accept ticket' }) as HTMLButtonElement).disabled).toBe(false);
});

test('confirmed acceptance stays visible when the follow-up read fails', async () => {
  let reads = 0,
    changed = 0;
  harness({
    changed: () => changed++,
    query: async () => {
      if (++reads > 1) throw Error('Refresh offline');
      return [ticket()];
    },
  });
  await screen.findByText('Printer offline');
  fill();
  await screen.findByText(/Accepted t2/);
  expect((await screen.findAllByText('Refresh offline')).length).toBeGreaterThan(0);
  expect(changed).toBe(1);
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Refresh inbox' }) as HTMLButtonElement).disabled).toBe(false),
  );
});
test('obsolete rejection cannot clear a newer pending command or show its error', async () => {
  let rejectOld!: (reason: Error) => void, finishNew!: (value: any) => void;
  const h = harness({
    api: { accept: () => new Promise((_r, j) => (rejectOld = j)), triage: async () => ({}) },
  });
  await screen.findByText('Printer offline');
  fill();
  await waitFor(() => expect(rejectOld).toBeDefined());
  h.rerender({ accept: () => new Promise((r) => (finishNew = r)), triage: async () => ({}) });
  fill('South draft', 'south-key');
  await waitFor(() => expect(finishNew).toBeDefined());
  await act(async () => rejectOld(Error('Old identity failed')));
  expect(screen.queryByText('Old identity failed')).toBeNull();
  expect((screen.getByRole('button', { name: 'Accept ticket' }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => finishNew({ id: 'south-1', subject: 'South draft', version: 0 }));
  await screen.findByText(/Accepted south-1/);
});
