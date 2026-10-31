import React from 'react';
import { expect } from 'expect';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { OperationsPanel } from '../web/OperationsPanel';
afterEach(cleanup);
test('loads counts from the injected API', async () => {
  render(
    <OperationsPanel
      api={{
        report: async () => ({ tickets: 3, pending: 2, activities: 1 }),
        dispatch: async () => ({ delivered: 0, failed: 0 }),
      }}
    />,
  );
  await screen.findByText('Pending');
  expect(screen.getByText('Pending').nextElementSibling?.textContent).toBe('2');
});
test('failed delivery remains visible and retry refreshes counts', async () => {
  let pending = 2;
  const api = {
    report: async () => ({ tickets: 2, pending, activities: 2 - pending }),
    dispatch: async (fail: boolean) => {
      if (fail) return { delivered: 0, failed: pending };
      const delivered = pending;
      pending = 0;
      return { delivered, failed: 0 };
    },
  };
  render(<OperationsPanel api={api} />);
  await screen.findByText('Pending');
  fireEvent.click(screen.getByRole('button', { name: 'Simulate outage' }));
  await screen.findByText(/still pending/);
  expect(screen.getByText('Pending').nextElementSibling?.textContent).toBe('2');
  fireEvent.click(screen.getByRole('button', { name: 'Deliver pending' }));
  await screen.findByText(/2 event.*delivered/);
  expect(screen.getByText('Pending').nextElementSibling?.textContent).toBe('0');
});
test('load failure exposes retry and can recover', async () => {
  let fail = true;
  const api = {
    report: async () => {
      if (fail) throw Error('offline');
      return { tickets: 0, pending: 0, activities: 0 };
    },
    dispatch: async () => ({ delivered: 0, failed: 0 }),
  };
  render(<OperationsPanel api={api} />);
  expect((await screen.findByRole('alert')).textContent).toContain('offline');
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByText('Pending');
  expect(screen.queryByRole('alert')).toBeNull();
});
test('slow previous API response cannot overwrite new API state', async () => {
  let resolve!: (value: any) => void;
  const old = {
    report: () => new Promise<any>((r) => (resolve = r)),
    dispatch: async () => ({ delivered: 0, failed: 0 }),
  };
  const { rerender } = render(<OperationsPanel api={old} />);
  const next = {
    report: async () => ({ tickets: 9, pending: 9, activities: 0 }),
    dispatch: old.dispatch,
  };
  rerender(<OperationsPanel api={next} />);
  await screen.findByText('Pending');
  resolve({ tickets: 1, pending: 1, activities: 0 });
  await waitFor(() => expect(screen.getByText('Pending').nextElementSibling?.textContent).toBe('9'));
});
test('action is disabled while delivery is unresolved', async () => {
  let release!: (value: any) => void;
  const api = {
    report: async () => ({ tickets: 1, pending: 1, activities: 0 }),
    dispatch: () => new Promise<any>((r) => (release = r)),
  };
  render(<OperationsPanel api={api} />);
  await screen.findByText('Pending');
  fireEvent.click(screen.getByRole('button', { name: 'Deliver pending' }));
  expect(
    (
      screen.getByRole('button', {
        name: 'Deliver pending',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  release({ delivered: 0, failed: 1 });
  await screen.findByText(/still pending/);
});
test('dispatch errors are visible and controls recover', async () => {
  render(
    <OperationsPanel
      api={{
        report: async () => ({ tickets: 1, pending: 1, activities: 0 }),
        dispatch: async () => {
          throw Error('delivery offline');
        },
      }}
    />,
  );
  await screen.findByText('Pending');
  fireEvent.click(screen.getByRole('button', { name: 'Deliver pending' }));
  expect((await screen.findByRole('alert')).textContent).toContain('delivery offline');
  expect(
    (
      screen.getByRole('button', {
        name: 'Deliver pending',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});
