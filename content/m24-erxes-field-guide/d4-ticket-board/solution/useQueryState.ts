import { useSearchParams } from 'react-router';

export function useQueryState(key: string): [string | null, (value: string | null) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const setValue = (value: string | null) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    });
  };
  return [searchParams.get(key), setValue];
}
