import React, { useEffect, useRef, useState } from 'react';
import { portalHeaders } from './headers';
import { CREATE_TICKET, LOGIN, PORTAL_REQUIRED, TICKETS, USER_REQUIRED, type Send, type Ticket } from './portal-api';

type Props = {
  /** Sends one operation to the gateway, with the headers you choose. */
  send: Send;
  /** This portal's app token, from the site's configuration. */
  appToken: string;
};

export function PortalApp({ send, appToken }: Props) {
  // TODO: a sign-in form, then the signed-in customer's tickets.
  return (
    <main>
      <h1>Sign in</h1>
    </main>
  );
}
