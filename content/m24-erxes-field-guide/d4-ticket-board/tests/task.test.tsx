import React from 'react';
import { expect } from 'expect';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { MemoryRouter, useLocation } from 'react-router';
import { TicketBoard } from '../TicketBoard';
import { selectedTicketIdsAtom } from '../state';
import { useQueryState } from '../useQueryState';

afterEach(cleanup);

const tickets = [
  { _id: 't1', subject: 'Charlie', priority: 'normal' },
  { _id: 't2', subject: 'Alpha', priority: 'high' },
  { _id: 't3', subject: 'Bravo', priority: 'normal' },
];

function Location() {
  const { search } = useLocation();
  return <span data-testid="search">{search}</span>;
}

function show(entry = '/tickets', store = createStore(), rows = tickets) {
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[entry]}>
        <TicketBoard tickets={rows} />
        <Location />
      </MemoryRouter>
    </Provider>,
  );
  return { store, ...view };
}

const subjects = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[1].textContent);
const search = () => screen.getByTestId('search').textContent;
const box = (subject: string) => screen.getByRole('checkbox', { name: `Select ${subject}` }) as HTMLInputElement;
const choose = (value: string) => fireEvent.change(screen.getByLabelText('Priority'), { target: { value } });

test(
  'useQueryState reads, sets and removes one key',
  () => {
    let current: any;
    function Probe() {
      current = useQueryState('priority');
      return <Location />;
    }
    render(
      <MemoryRouter initialEntries={['/?page=2']}>
        <Probe />
      </MemoryRouter>,
    );
    expect(current[0]).toBe(null);
    React.act(() => current[1]('high'));
    expect(current[0]).toBe('high');
    expect(search()).toBe('?page=2&priority=high');
    React.act(() => current[1](null));
    expect(current[0]).toBe(null);
    expect(search()).toBe('?page=2');
  },
  { hint: 'Change a copy of the existing parameters, or you will lose the others.' },
);

test(
  'the rows come from TanStack Table in a real table',
  () => {
    show();
    expect(subjects()).toEqual(['Charlie', 'Alpha', 'Bravo']);
    expect(within(screen.getByRole('table')).getByRole('columnheader', { name: 'Priority' })).toBeTruthy();
  },
  { hint: 'getCoreRowModel gives you rows, and flexRender renders a header definition.' },
);

test(
  'the Subject header sorts both ways',
  () => {
    show();
    const header = screen.getByRole('button', { name: 'Subject' });
    fireEvent.click(header);
    expect(subjects()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    fireEvent.click(header);
    expect(subjects()).toEqual(['Charlie', 'Bravo', 'Alpha']);
  },
  { hint: 'Sorting needs getSortedRowModel, and sort state that the table can change.' },
);

test(
  'the priority filter lives in the URL',
  () => {
    show('/tickets?priority=high&page=2');
    expect(subjects()).toEqual(['Alpha']);
    expect((screen.getByLabelText('Priority') as HTMLSelectElement).value).toBe('high');
    choose('normal');
    expect(subjects()).toEqual(['Charlie', 'Bravo']);
    expect(search()).toBe('?priority=normal&page=2');
    choose('');
    expect(subjects()).toEqual(['Charlie', 'Alpha', 'Bravo']);
    expect(search()).toBe('?page=2');
  },
  { hint: 'A link someone pastes must open the same view. All means the key is gone.' },
);

test(
  'selection belongs to the ticket, not to its row position',
  () => {
    const { store } = show();
    fireEvent.click(box('Charlie'));
    fireEvent.click(screen.getByRole('button', { name: 'Subject' }));
    expect(subjects()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(box('Charlie').checked).toBe(true);
    expect(box('Alpha').checked).toBe(false);
    expect(store.get(selectedTicketIdsAtom)).toEqual(['t1']);
  },
  { hint: 'getRowId makes a row keep its ticket ID. Otherwise, row IDs are positions.' },
);

test(
  'selection survives a filter and can be undone',
  () => {
    const { store } = show();
    fireEvent.click(box('Charlie'));
    fireEvent.click(box('Alpha'));
    expect(screen.getByRole('status').textContent).toBe('2 selected');
    choose('high');
    expect(screen.getByRole('status').textContent).toBe('2 selected');
    fireEvent.click(box('Alpha'));
    expect(screen.getByRole('status').textContent).toBe('1 selected');
    expect(store.get(selectedTicketIdsAtom)).toEqual(['t1']);
  },
  { hint: 'Selected IDs are a separate fact from which rows are visible.' },
);

test(
  'selection is shared through the atom, and survives the board remounting',
  () => {
    const store = createStore();
    const first = show('/tickets', store);
    fireEvent.click(box('Bravo'));
    first.unmount();
    show('/tickets', store);
    expect(box('Bravo').checked).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('1 selected');
  },
  { hint: 'useState dies with the component. An atom does not.' },
);

test(
  'an empty result says so, and the filter stays usable',
  () => {
    show('/tickets?priority=high', createStore(), [tickets[0]]);
    expect(screen.queryByRole('table')).toBe(null);
    expect(screen.getByText('No tickets match')).toBeTruthy();
    choose('');
    expect(subjects()).toEqual(['Charlie']);
  },
  { hint: 'Show the message in place of the table, and keep the select outside of it.' },
);
