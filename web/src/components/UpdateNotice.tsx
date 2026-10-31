import { useEffect, useState } from 'react';
import { api } from '../api';

type Update = Awaited<ReturnType<typeof api.update>>;

/** Only an installed copy with a newer release shows anything. */
export function UpdateNotice() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    api.update().then(setUpdate, () => {});
  }, []);
  if (!update?.latest || !update.command) return null;
  const copy = async () => {
    await navigator.clipboard.writeText(update.command!);
    setCopied(true);
  };
  return (
    <details className="menu update-menu">
      <summary className="icon-btn" title={`Version ${update.latest} is available`}>
        Update
      </summary>
      <div className="menu-pop card">
        <p>
          Version <b>{update.latest}</b> is out, and you have {update.current}. Paste this into{' '}
          {navigator.platform.startsWith('Win') ? 'PowerShell' : 'Terminal'}. It closes the app, backs up your progress
          and opens the new version.
        </p>
        <pre className="update-command">{update.command}</pre>
        <button className="btn small" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </details>
  );
}
