import type { InboxApi } from './session-contract';
export interface InboxProps {
  api: InboxApi;
  changed(): void;
}
