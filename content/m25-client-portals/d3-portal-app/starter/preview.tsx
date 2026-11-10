// Runs your site against a pretend gateway, and lists each request with the headers it carried. (Provided.)
// Sign in as mara@example.com or otto@example.com, password "portal". A session lasts 45 seconds here.
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { APP_TOKEN, createFakePortal, type Logged } from './fake-portal';
import { PortalApp } from './PortalApp';

function Preview() {
  const [log, setLog] = useState<Logged[]>([]);
  const [appToken, setAppToken] = useState(APP_TOKEN);
  const portal = useMemo(
    () => createFakePortal({ sessionMs: 45_000, onRequest: (entry) => setLog((entries) => [...entries, entry].slice(-12)) }),
    [],
  );
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, padding: 16 }}>
      <section>
        <PortalApp key={appToken} send={portal.send} appToken={appToken} />
      </section>
      <aside style={{ fontSize: 13 }}>
        <strong>Requests</strong>
        <p style={{ color: '#667' }}>mara@example.com or otto@example.com, password "portal". Sessions last 45 seconds.</p>
        <button type="button" onClick={() => setAppToken((t) => (t === APP_TOKEN ? 'a-wrong-token' : APP_TOKEN))}>
          {appToken === APP_TOKEN ? 'Break the app token' : 'Restore the app token'}
        </button>
        <ol>
          {log.map((entry, i) => (
            <li key={i}>
              <code>{entry.operation}</code>
              <br />
              headers: {entry.headers.join(', ') || 'none'}
              <br />
              answer: {entry.answer}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);
