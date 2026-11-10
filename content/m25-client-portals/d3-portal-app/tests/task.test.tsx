import React from 'react';
import { expect } from 'expect';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { portalHeaders } from '../headers';
import { PortalApp } from '../PortalApp';
import { CREATE_TICKET, LOGIN, PORTAL_REQUIRED, TICKETS, USER_REQUIRED, type Answer, type Ticket } from '../portal-api';

afterEach(cleanup);

const APP = 'app-token-help';
type Call = { operation: string; variables: Record<string, unknown>; headers: Record<string, string> };

function backend() {
  const calls: Call[] = [];
  const sessions = new Map<string, string>();
  const tickets: Record<string, Ticket[]> = {
    mara: [
      { _id: 't2', subject: 'Invoice address', status: 'answered' },
      { _id: 't1', subject: 'Printer on fire', status: 'open' },
    ],
    otto: [],
  };
  let logins = 0;
  let nextId = 3;
  /** Answers held back until the test releases them, by operation. */
  const held = new Map<string, (() => void)[]>();
  const holding = new Set<string>();
  /** An ordinary failure to hand out once, by operation. */
  const failing = new Map<string, string>();
  const error = (message: string): Answer => ({ data: null, errors: [{ message }] });

  function answer({ operation, variables, headers }: Call): Answer {
    if (headers['x-app-token'] !== APP) return error(PORTAL_REQUIRED);
    if (operation === LOGIN) {
      const name = String(variables.email).split('@')[0];
      if (!(name in tickets) || variables.password !== 'portal') return error('Invalid login');
      const token = `token-${name}-${++logins}`;
      sessions.set(token, name);
      return { data: { [LOGIN]: { token } } };
    }
    const name = sessions.get(headers['client-auth-token']);
    if (!name) return error(USER_REQUIRED);
    const failure = failing.get(operation);
    if (failure) {
      failing.delete(operation);
      return error(failure);
    }
    if (operation === TICKETS) return { data: { [TICKETS]: [...tickets[name]] } };
    if (operation === CREATE_TICKET) {
      const ticket: Ticket = { _id: `t${nextId++}`, subject: String(variables.subject), status: 'open' };
      tickets[name].unshift(ticket);
      return { data: { [CREATE_TICKET]: ticket } };
    }
    return error('Unknown operation');
  }

  const send = async (operation: string, variables: Record<string, unknown>, headers: Record<string, string>) => {
    const call = { operation, variables, headers: { ...headers } };
    calls.push(call);
    // The answer is decided when the request arrives, as a real server would.
    const result = answer(call);
    if (holding.has(operation)) {
      await new Promise<void>((resolve) => held.set(operation, [...(held.get(operation) ?? []), resolve]));
    }
    return result;
  };

  return {
    send,
    calls,
    of: (operation: string) => calls.filter((call) => call.operation === operation),
    expire: () => sessions.clear(),
    fail: (operation: string, message: string) => failing.set(operation, message),
    hold: (operation: string) => holding.add(operation),
    release: async (operation: string) => {
      holding.delete(operation);
      const waiting = held.get(operation) ?? [];
      held.delete(operation);
      await act(async () => {
        waiting.forEach((resolve) => resolve());
        await Promise.resolve();
      });
    },
  };
}

function show(appToken = APP) {
  const api = backend();
  render(<PortalApp send={api.send} appToken={appToken} />);
  return api;
}

function signInAs(name: string, password = 'portal') {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: `${name}@example.com` } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

const items = () => screen.queryAllByRole('listitem').map((item) => item.textContent);

test(
  'the app token goes on every request, the customer token only when there is one',
  () => {
    expect(portalHeaders('app-1')).toEqual({ 'x-app-token': 'app-1' });
    expect(portalHeaders('app-1', null)).toEqual({ 'x-app-token': 'app-1' });
    expect(portalHeaders('app-1', '')).toEqual({ 'x-app-token': 'app-1' });
    expect(portalHeaders('app-1', 'auth-9')).toEqual({ 'x-app-token': 'app-1', 'client-auth-token': 'auth-9' });
  },
  { hint: 'Leave client-auth-token out entirely when nobody is signed in. An empty header is still a header.' },
);

test(
  'it starts signed out, and asks for nothing',
  async () => {
    const api = show();
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeTruthy();
    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect(screen.getByLabelText(/password/i)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /my tickets/i })).toBeNull();
    await act(async () => {});
    expect(api.calls).toEqual([]);
  },
  { hint: 'Render a form with inputs labelled Email and Password, and a "Sign in" button. Load tickets only once there is a token.' },
);

test(
  'signing in sends the app token alone, then loads the tickets with both',
  async () => {
    const api = show();
    signInAs('mara');
    await screen.findByRole('heading', { name: /my tickets/i });
    await waitFor(() => expect(items()).toHaveLength(2));
    expect(items()[0]).toMatch(/Invoice address/);
    expect(items()[0]).toMatch(/answered/);
    expect(items()[1]).toMatch(/Printer on fire/);

    const [login] = api.of(LOGIN);
    expect(login.variables).toEqual({ email: 'mara@example.com', password: 'portal' });
    expect(login.headers).toEqual({ 'x-app-token': APP });
    const [list] = api.of(TICKETS);
    expect(list.headers).toEqual({ 'x-app-token': APP, 'client-auth-token': 'token-mara-1' });
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  },
  { hint: 'send(LOGIN, { email, password }, headers). The token is at data[LOGIN].token. Keep it in state and use it for TICKETS.' },
);

test(
  'a wrong password stays on the form and says why',
  async () => {
    const api = show();
    signInAs('mara', 'nope');
    expect((await screen.findByRole('alert')).textContent).toMatch(/Invalid login/);
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeTruthy();
    expect(api.of(TICKETS)).toEqual([]);
    signInAs('mara');
    await screen.findByRole('heading', { name: /my tickets/i });
    expect(screen.queryByText(/Invalid login/)).toBeNull();
  },
  { hint: 'Show errors[0].message in an element with role="alert", and clear it on the next attempt.' },
);

test(
  'the button is disabled while signing in, so one click is one request',
  async () => {
    const api = show();
    api.hold(LOGIN);
    signInAs('mara');
    const button = screen.getByRole('button', { name: /sign in/i }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(true));
    fireEvent.click(button);
    fireEvent.submit(button.closest('form')!);
    await api.release(LOGIN);
    await screen.findByRole('heading', { name: /my tickets/i });
    expect(api.of(LOGIN)).toHaveLength(1);
  },
  { hint: 'Track "signing in" in state. Disable the button, and ignore a second submit while it is true.' },
);

test(
  'loading, then an honest empty state',
  async () => {
    const api = show();
    api.hold(TICKETS);
    signInAs('otto');
    expect((await screen.findByRole('status')).textContent).toMatch(/loading/i);
    expect(screen.queryByText(/no tickets yet/i)).toBeNull();
    await api.release(TICKETS);
    await screen.findByText(/no tickets yet/i);
    expect(screen.queryByRole('status')).toBeNull();
  },
  { hint: 'Three states: not loaded yet (role="status"), loaded and empty ("No tickets yet"), loaded with items. null and [] are different.' },
);

test(
  'a failed load is shown as a failure, never as "no tickets"',
  async () => {
    const api = show();
    api.fail(TICKETS, 'Database is down');
    signInAs('mara');
    expect((await screen.findByRole('alert')).textContent).toMatch(/Database is down/);
    expect(screen.queryByText(/no tickets yet/i)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('heading', { name: /my tickets/i })).toBeTruthy();
  },
  { hint: 'An ordinary error keeps the customer signed in. Show its message, and neither the loading line nor the empty one.' },
);

test(
  'a new ticket goes to the top and the field is cleared',
  async () => {
    const api = show();
    signInAs('mara');
    await waitFor(() => expect(items()).toHaveLength(2));
    const field = screen.getByLabelText(/subject/i) as HTMLInputElement;

    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await act(async () => {});
    expect(api.of(CREATE_TICKET)).toEqual([]);

    fireEvent.change(field, { target: { value: '  Wrong invoice  ' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(items()).toHaveLength(3));
    expect(items()[0]).toMatch(/Wrong invoice/);
    expect(items()[0]).toMatch(/open/);
    const [create] = api.of(CREATE_TICKET);
    expect(create.variables).toEqual({ subject: 'Wrong invoice' });
    expect(create.headers).toEqual({ 'x-app-token': APP, 'client-auth-token': 'token-mara-1' });
    expect(field.value).toBe('');
  },
  { hint: 'A form with an input labelled Subject and a "Send" button. Trim, skip an empty subject, and put data[CREATE_TICKET] first in the list.' },
);

test(
  'an ended session goes back to sign-in, says why, and shows nothing of the old one',
  async () => {
    const api = show();
    signInAs('mara');
    await waitFor(() => expect(items()).toHaveLength(2));
    api.expire();
    fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: 'One more thing' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByRole('heading', { name: /sign in/i });
    expect(screen.getByRole('alert').textContent).toMatch(/session ended/i);
    expect(items()).toEqual([]);
    expect(screen.queryByText(/Printer on fire/)).toBeNull();

    signInAs('otto');
    await screen.findByText(/no tickets yet/i);
    expect(api.of(LOGIN).at(-1)!.headers).toEqual({ 'x-app-token': APP });
    expect(api.of(TICKETS).at(-1)!.headers['client-auth-token']).toBe('token-otto-2');
    expect(screen.queryByText(/session ended/i)).toBeNull();
  },
  { hint: 'When a signed-in request answers "Client portal user required": forget the token and the tickets, and show the form with "Your session ended. Please sign in again."' },
);

test(
  "a wrong app token is the site's fault, and no sign-in form is offered",
  async () => {
    const api = show('a-wrong-token');
    signInAs('mara');
    expect((await screen.findByRole('alert')).textContent).toMatch(/set up correctly/i);
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull();
    expect(api.of(TICKETS)).toEqual([]);
  },
  { hint: '"Client portal required" is about the site, not the visitor. Show "This site isn\'t set up correctly." and nothing they could retry.' },
);

test(
  'signing out clears the screen at once',
  async () => {
    const api = show();
    signInAs('mara');
    await waitFor(() => expect(items()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeTruthy();
    expect(items()).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();

    api.hold(TICKETS);
    signInAs('otto');
    await screen.findByRole('status');
    expect(items()).toEqual([]);
    await api.release(TICKETS);
    await screen.findByText(/no tickets yet/i);
  },
  { hint: 'A "Sign out" button forgets the token and the list together. The next customer starts from "not loaded yet".' },
);

test(
  'an answer that arrives after sign-out is dropped',
  async () => {
    const api = show();
    api.hold(TICKETS);
    signInAs('mara');
    await screen.findByRole('status');
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    await api.release(TICKETS);
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeTruthy();
    expect(items()).toEqual([]);

    // Otto signs in while Mara's late list is still possible: he must only ever see his own.
    signInAs('otto');
    await screen.findByText(/no tickets yet/i);
    expect(screen.queryByText(/Printer on fire/)).toBeNull();
  },
  { hint: 'Remember which session a request was sent in (a counter in a ref works). When its answer arrives in a different session, ignore it.' },
);

test(
  'a late "session ended" from the old session does not sign the next customer out',
  async () => {
    const api = show();
    signInAs('mara');
    await waitFor(() => expect(items()).toHaveLength(2));
    api.expire();
    api.hold(CREATE_TICKET);
    fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: 'Late' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(api.of(CREATE_TICKET)).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    signInAs('otto');
    await screen.findByText(/no tickets yet/i);
    await api.release(CREATE_TICKET);
    expect(screen.getByRole('heading', { name: /my tickets/i })).toBeTruthy();
    expect(screen.queryByText(/session ended/i)).toBeNull();
  },
  { hint: 'Do the session check before you react to an error, not only before you show data.' },
);
