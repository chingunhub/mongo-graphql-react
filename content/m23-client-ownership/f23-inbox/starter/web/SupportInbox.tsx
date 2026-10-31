import type { InboxProps } from './inbox-contract';
export function SupportInbox({ api, changed }: InboxProps) {
  // TODO: query state, validated draft, accepted writes, refetch and failure recovery.
  return (
    <section>
      <h2>Support inbox</h2>
      <p>Implement the inbox.</p>
    </section>
  );
}
