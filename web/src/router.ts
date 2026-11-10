import { useEffect, useState } from 'react';

const listeners = new Set<() => void>();
const guards = new Set<() => Promise<void>>();
let currentPath = location.pathname;
let navigating = 0;
export function beforeNavigate(flush: () => Promise<void>) {
  guards.add(flush);
  return () => { guards.delete(flush); };
}
async function ready() { await Promise.all([...guards].map(flush => flush())); }

export async function navigate(to: string) {
  if (to === currentPath) return;
  const request = ++navigating;
  try { await ready(); } catch { return; } // The editor keeps the draft and shows its save error.
  if (request !== navigating) return;
  history.pushState(null, '', to);
  currentPath = to;
  listeners.forEach((l) => l());
}

window.addEventListener('popstate', async () => {
  const request = ++navigating;
  const target = location.pathname;
  try { await ready(); } catch {
    if (request === navigating) history.pushState(null, '', currentPath);
    return;
  }
  if (request !== navigating) return;
  currentPath = target;
  listeners.forEach((l) => l());
});

export function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const l = () => setPath(location.pathname);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return path;
}

/** Intercept clicks on same-origin links so navigation stays client-side. */
export function onLinkClick(e: React.MouseEvent<HTMLAnchorElement>) {
  const href = e.currentTarget.getAttribute('href');
  if (!href || !href.startsWith('/') || e.metaKey || e.ctrlKey || e.button !== 0) return;
  if (/^\/(preview|launch|reference|mine)\//.test(href)) return;
  e.preventDefault();
  navigate(href);
}
