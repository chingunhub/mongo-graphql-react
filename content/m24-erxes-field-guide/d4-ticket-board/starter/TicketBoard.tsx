import React from 'react';

export type BoardTicket = { _id: string; subject: string; priority: string };

export function TicketBoard({ tickets }: { tickets: BoardTicket[] }) {
  return <p>TODO: build the board</p>;
}
