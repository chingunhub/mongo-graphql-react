import { useSearchParams } from 'react-router';

export function useQueryState(key: string): [string | null, (value: string | null) => void] {
  throw new Error('TODO: read and write this key in the URL');
}
