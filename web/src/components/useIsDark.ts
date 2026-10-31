import { useEffect, useState } from 'react';

function resolve() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function useIsDark() {
  const [dark, setDark] = useState(resolve);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setDark(resolve());
    mq.addEventListener('change', update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener('change', update);
      mo.disconnect();
    };
  }, []);
  return dark;
}
