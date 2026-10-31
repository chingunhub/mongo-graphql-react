import { useEffect, useState } from 'react';

const listeners = new Set<() => void>();

export function navigate(to: string) {
  if (to === location.pathname) return;
  history.pushState(null, '', to);
  listeners.forEach((l) => l());
}

window.addEventListener('popstate', () => listeners.forEach((l) => l()));

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
