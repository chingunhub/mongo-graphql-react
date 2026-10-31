import React, { useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { selectedTicketIdsAtom } from './state';
import { useQueryState } from './useQueryState';

export type BoardTicket = { _id: string; subject: string; priority: string };

const columns: ColumnDef<BoardTicket>[] = [
  { id: 'select', enableSorting: false, header: 'Select' },
  { accessorKey: 'subject', header: 'Subject' },
  { accessorKey: 'priority', header: 'Priority', enableSorting: false },
];

export function TicketBoard({ tickets }: { tickets: BoardTicket[] }) {
  const [priority, setPriority] = useQueryState('priority');
  const [selected, setSelected] = useAtom(selectedTicketIdsAtom);
  const [sorting, setSorting] = useState<SortingState>([]);
  const visible = useMemo(
    () => (priority ? tickets.filter((ticket) => ticket.priority === priority) : tickets),
    [tickets, priority],
  );
  const table = useReactTable({
    data: visible,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (ticket) => ticket._id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const toggle = (_id: string) =>
    setSelected((ids) => (ids.includes(_id) ? ids.filter((id) => id !== _id) : [...ids, _id]));

  return (
    <section>
      <label>
        Priority
        <select aria-label="Priority" value={priority ?? ''} onChange={(event) => setPriority(event.target.value || null)}>
          <option value="">All</option>
          <option value="high">high</option>
          <option value="normal">normal</option>
        </select>
      </label>
      <p role="status">{selected.length} selected</p>
      {visible.length === 0 ? (
        <p>No tickets match</p>
      ) : (
        <table>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id}>
                    {header.column.getCanSort() ? (
                      <button type="button" onClick={header.column.getToggleSortingHandler()}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.original.subject}`}
                    checked={selected.includes(row.id)}
                    onChange={() => toggle(row.id)}
                  />
                </td>
                <td>{row.original.subject}</td>
                <td>{row.original.priority}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
