import React, { useEffect, useRef, useState } from 'react';
import { portalHeaders } from './headers';
import { CREATE_TICKET, LOGIN, PORTAL_REQUIRED, TICKETS, USER_REQUIRED, type Send, type Ticket } from './portal-api';

type Props = {
  /** Sends one operation to the gateway, with the headers you choose. */
  send: Send;
  /** This portal's app token, from the site's configuration. */
  appToken: string;
};

type Outcome = { stale: true } | { stale: false; message?: string; value?: any };

export function PortalApp({ send, appToken }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const [notice, setNotice] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [subject, setSubject] = useState('');
  // Goes up whenever the session changes. An answer asked for in an older session is dropped.
  const session = useRef(0);

  function endSession(text: string) {
    session.current++;
    setToken(null);
    setTickets(null);
    setLoadFailed(false);
    setSubject('');
    setSigningIn(false);
    setNotice(text);
  }

  async function ask(operation: string, variables: Record<string, unknown>, authToken?: string): Promise<Outcome> {
    const asked = session.current;
    let answer;
    try {
      answer = await send(operation, variables, portalHeaders(appToken, authToken));
    } catch (error) {
      answer = { errors: [{ message: (error as Error).message }] };
    }
    if (asked !== session.current) return { stale: true };
    const message = answer.errors?.[0]?.message;
    if (message === PORTAL_REQUIRED) {
      endSession('');
      setBroken(true);
      return { stale: true };
    }
    if (message === USER_REQUIRED && authToken) {
      endSession('Your session ended. Please sign in again.');
      return { stale: true };
    }
    return { stale: false, message, value: answer.data?.[operation] };
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (signingIn) return;
    setSigningIn(true);
    setNotice('');
    const outcome = await ask(LOGIN, { email, password });
    if (outcome.stale) return;
    setSigningIn(false);
    if (outcome.message || !outcome.value?.token) return setNotice(outcome.message ?? 'Could not sign in.');
    session.current++;
    setPassword('');
    setToken(outcome.value.token);
  }

  useEffect(() => {
    if (!token) return;
    void (async () => {
      const outcome = await ask(TICKETS, {}, token);
      if (outcome.stale) return;
      if (outcome.message) {
        setLoadFailed(true);
        return setNotice(outcome.message);
      }
      setTickets(outcome.value ?? []);
    })();
  }, [token]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const text = subject.trim();
    if (!text || !token) return;
    const outcome = await ask(CREATE_TICKET, { subject: text }, token);
    if (outcome.stale) return;
    if (outcome.message) return setNotice(outcome.message);
    setNotice('');
    setSubject('');
    setTickets((current) => [outcome.value, ...(current ?? [])]);
  }

  if (broken) {
    return (
      <main>
        <p role="alert">This site isn't set up correctly.</p>
      </main>
    );
  }

  if (!token) {
    return (
      <main>
        <h1>Sign in</h1>
        {notice && <p role="alert">{notice}</p>}
        <form onSubmit={signIn}>
          <label>
            Email <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Password <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button disabled={signingIn}>Sign in</button>
        </form>
      </main>
    );
  }

  return (
    <main>
      <h1>My tickets</h1>
      <button type="button" onClick={() => endSession('')}>
        Sign out
      </button>
      {notice && <p role="alert">{notice}</p>}
      {tickets === null ? (
        loadFailed ? null : (
          <p role="status">Loading tickets…</p>
        )
      ) : tickets.length === 0 ? (
        <p>No tickets yet</p>
      ) : (
        <ul>
          {tickets.map((ticket) => (
            <li key={ticket._id}>
              {ticket.subject} <span>{ticket.status}</span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={create}>
        <label>
          Subject <input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <button>Send</button>
      </form>
    </main>
  );
}
