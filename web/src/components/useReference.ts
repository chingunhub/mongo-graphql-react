import { useEffect, useState } from 'react';
import { api } from '../api';

/** Polls the reference API status until it's running, then slowly. */
export function useReferenceStatus() {
  const [status, setStatus] = useState('starting');
  useEffect(() => {
    let alive = true;
    let timer: number;
    const tick = async () => {
      try {
        const s = await api.reference();
        if (!alive) return;
        setStatus(s.status);
        timer = window.setTimeout(tick, s.status === 'running' ? 15000 : 1500);
      } catch {
        if (alive) timer = window.setTimeout(tick, 3000);
      }
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
  return { status };
}
