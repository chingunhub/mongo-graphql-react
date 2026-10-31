import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TICKETS } from './operations';
import type { TicketsQuery } from './generated/graphql';
import type { InboxProps } from './inbox-contract';
const draft = z.object({
  sourceId: z.string().trim().min(1, 'Source key is required'),
  subject: z.string().trim().min(1, 'Subject is required'),
});
export function SupportInbox({ api, changed }: InboxProps) {
  const { data, loading, error, refetch } = useQuery<TicketsQuery>(TICKETS);
  const {
    register,
    handleSubmit,
    formState: { errors },
    clearErrors,
  } = useForm<z.infer<typeof draft>>({
    resolver: zodResolver(draft),
    defaultValues: { sourceId: 'web-1', subject: '' },
  });
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(''),
    [message, setMessage] = useState('');
  const generation = useRef(0),
    inFlight = useRef(false);
  useEffect(() => {
    generation.current++;
    inFlight.current = false;
    setBusy(false);
    setFailure('');
    setMessage('');
    clearErrors();
    return () => {
      generation.current++;
    };
  }, [api, clearErrors]);
  async function action(work: () => Promise<void>) {
    if (inFlight.current) return;
    const own = generation.current;
    inFlight.current = true;
    setBusy(true);
    setFailure('');
    setMessage('');
    try {
      await work();
    } catch (error) {
      if (own === generation.current) setFailure((error as Error).message);
    } finally {
      if (own === generation.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }
  const accept = handleSubmit((values) => {
    const own = generation.current;
    return action(async () => {
      const result = await api.accept({ ...values, contactId: 'c1' });
      if (own !== generation.current) return;
      changed();
      setMessage('Accepted ' + result.id);
      await refetch();
    });
  });
  function raise(ticket: TicketsQuery['tickets'][number]) {
    const own = generation.current;
    void action(async () => {
      await api.triage({
        ticketId: ticket.id,
        expectedVersion: ticket.version,
        priority: 'high',
      });
      if (own !== generation.current) return;
      setMessage('Priority updated');
      await refetch();
    });
  }
  return (
    <section>
      <h2>Support inbox</h2>
      <form onSubmit={accept} noValidate>
        <label>
          Source key
          <input {...register('sourceId')} aria-invalid={!!errors.sourceId} />
        </label>
        <label>
          Subject
          <input {...register('subject')} aria-invalid={!!errors.subject} />
        </label>
        <button disabled={busy}>Accept ticket</button>
      </form>
      {errors.sourceId && <p role="alert">{errors.sourceId.message}</p>}
      {errors.subject && <p role="alert">{errors.subject.message}</p>}
      {failure && failure !== error?.message && <p role="alert">{failure}</p>}
      {message && <p role="status">{message}</p>}
      {loading && <p role="status">Loading tickets…</p>}
      {error && <p role="alert">{error.message}</p>}
      {!loading && !error && data?.tickets.length === 0 && <p>No tickets yet</p>}
      <button
        disabled={busy || loading}
        onClick={() =>
          void action(async () => {
            await refetch();
          })
        }
      >
        Refresh inbox
      </button>
      <div className="tickets">
        {data?.tickets.map((ticket) => (
          <article key={ticket.id}>
            <div>
              <strong>{ticket.subject}</strong>
              <p>
                {ticket.contact?.name ?? 'Contact unavailable'} · {ticket.priority} · version {ticket.version}
              </p>
            </div>
            <button disabled={busy} onClick={() => raise(ticket)}>
              Raise priority
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
