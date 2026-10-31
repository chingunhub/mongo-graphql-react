export type CacheMode = 'shared' | 'request';
export interface CacheFrame {
  tenant: 'north' | 'south';
  title: string;
  detail: string;
  cache: string;
  returned: string;
  reads: number;
  leaked: boolean;
  active: number;
}
export function cacheTrace(mode: CacheMode, first: 'north' | 'south'): CacheFrame[] {
  const second = first === 'north' ? 'south' : 'north';
  const name = (tenant: string) => (tenant === 'north' ? 'North booking' : 'South booking');
  const shared = mode === 'shared';
  return [
    {
      tenant: first,
      title: 'Two requests, one local ID',
      detail: 'Both organizations have booking 7. Predict what the second request will receive.',
      cache: 'empty',
      returned: '—',
      reads: 0,
      leaked: false,
      active: 0,
    },
    {
      tenant: first,
      title: first + ' requests booking 7',
      detail: 'Cache miss. The database query includes the correct tenant.',
      cache: 'empty',
      returned: '—',
      reads: 1,
      leaked: false,
      active: 1,
    },
    {
      tenant: first,
      title: 'First response is cached',
      detail: 'The record is stored under key 7. Its lifetime now matters.',
      cache: '7 → ' + name(first),
      returned: name(first),
      reads: 1,
      leaked: false,
      active: 2,
    },
    {
      tenant: second,
      title: second + ' requests booking 7',
      detail: shared
        ? 'The shared loader already has key 7. The database will not be consulted.'
        : 'A new request owns a fresh loader. Key 7 is a miss in this instance.',
      cache: shared ? '7 → ' + name(first) : 'empty (new request)',
      returned: '—',
      reads: shared ? 1 : 2,
      leaked: false,
      active: 1,
    },
    {
      tenant: second,
      title: 'Second response',
      detail: shared
        ? 'A correct query filter did not help: a cache hit bypassed the query.'
        : 'The second scoped query returns the second organization’s booking.',
      cache: '7 → ' + name(shared ? first : second),
      returned: name(shared ? first : second),
      reads: shared ? 1 : 2,
      leaked: shared,
      active: 2,
    },
  ];
}
export type CrashPoint = 'before-effect' | 'after-effect' | 'after-ack';
export interface DeliveryFrame {
  title: string;
  detail: string;
  pending: boolean;
  effects: number;
  attempts: number;
  receipt: boolean;
  stage: number;
}
export function deliveryTrace(crash: CrashPoint, idempotent: boolean): DeliveryFrame[] {
  let pending = true,
    effects = 0,
    attempts = 0,
    receipt = false;
  const frames: DeliveryFrame[] = [];
  const add = (title: string, detail: string, stage: number) =>
    frames.push({ title, detail, pending, effects, attempts, receipt, stage });
  add('Ticket + intent commit', 'One document stores the ticket and its pending opening event.', 0);
  attempts++;
  add('Worker attempt 1', 'The same tenant and event ID travel to the consumer.', 1);
  if (crash !== 'before-effect') {
    effects++;
    receipt = idempotent;
    add(
      'Effect committed',
      idempotent
        ? 'The activity is durable; acknowledgement has not happened yet.'
        : 'The counter moved; acknowledgement has not happened yet.',
      2,
    );
  }
  if (crash === 'after-ack') {
    pending = false;
    add('Acknowledged', 'The source marks the event delivered after the consumer succeeds.', 0);
  }
  add(
    'Process stops',
    crash === 'before-effect'
      ? 'No effect committed. Pending intent remains.'
      : crash === 'after-effect'
        ? 'The effect exists, but pending intent remains. Recovery cannot assume it failed.'
        : 'Both effect and acknowledgement exist.',
    1,
  );
  if (pending) {
    attempts++;
    add('Recovery retries the same event', 'The dispatcher sees pending work and preserves the event ID.', 1);
    if (!idempotent || !receipt) {
      effects++;
      receipt = idempotent;
      add(
        idempotent ? 'Consumer commits an activity' : 'Consumer increments the counter',
        idempotent ? 'The unique receipt is the effect.' : 'A naive counter increments on every attempt.',
        2,
      );
    } else
      add(
        'Existing receipt found',
        'The consumer returns the existing receipt instead of creating a second activity.',
        2,
      );
    pending = false;
    add('Recovery acknowledges', 'The event is no longer pending.', 0);
  } else add('Recovery finds no pending work', 'No extra worker attempt is needed.', 0);
  return frames;
}

export const WORKSPACE_GRAPH: Record<string, string[]> = {
  'reservation-screen': ['reservations', 'ui-kit'],
  'admin-console': ['catalogue', 'ui-kit'],
  reservations: ['contracts'],
  catalogue: ['contracts'],
  contracts: [],
  'ui-kit': [],
};
export type GraphDirection = 'consumers' | 'dependencies';
/** Walks one direction of the graph. "consumers" answers what to re-test; "dependencies" what to build first. */
export function reach(graph: Record<string, string[]>, start: string, direction: GraphDirection): string[] {
  const found = new Set([start]);
  let size = 0;
  while (size !== found.size) {
    size = found.size;
    for (const [name, needs] of Object.entries(graph)) {
      if (direction === 'consumers' && needs.some((need) => found.has(need))) found.add(name);
      if (direction === 'dependencies' && found.has(name)) needs.forEach((need) => found.add(need));
    }
  }
  return Object.keys(graph).filter((name) => found.has(name));
}

export type WriteStrategy = 'save-first' | 'publish-first' | 'stored-intent';
export type WriteCrash = 'none' | 'between';
export interface WriteFrame {
  title: string;
  detail: string;
  saved: boolean;
  owed: boolean;
  sent: boolean;
  stage: number;
  verdict: 'ok' | 'lost' | 'ghost' | null;
}
export function dualWriteTrace(strategy: WriteStrategy, crash: WriteCrash): WriteFrame[] {
  let saved = false,
    owed = false,
    sent = false;
  const frames: WriteFrame[] = [];
  const add = (title: string, detail: string, stage: number, verdict: WriteFrame['verdict'] = null) =>
    frames.push({ title, detail, saved, owed, sent, stage, verdict });
  const dies = crash === 'between';
  add('Request accepted', 'A reader reserves a book. Two things must become true: a row and a confirmation.', 0);
  if (strategy === 'publish-first') {
    sent = true;
    add('Confirmation sent', 'The message has left. It cannot be taken back.', 1);
    if (dies) {
      add('Process dies', 'The row was never written, and nothing here remembers the promise.', 2);
      add('Recovery has nothing to go on', 'The reader was told about a reservation that does not exist.', 0, 'ghost');
      return frames;
    }
    saved = true;
    add('Row saved', 'Both effects landed, this time.', 0, 'ok');
    return frames;
  }
  saved = true;
  owed = strategy === 'stored-intent';
  add(
    owed ? 'Row and intent commit together' : 'Row saved',
    owed
      ? 'One document holds the reservation and a pending "tell the reader" fact, so one write commits both.'
      : 'The reservation is durable. The obligation to tell the reader lives only in this process.',
    0,
  );
  if (dies) {
    add(
      'Process dies',
      owed ? 'Nothing was sent, but the database still says a message is owed.' : 'The obligation died with the process.',
      2,
    );
    if (!owed) {
      add('Recovery has nothing to go on', 'The row looks perfectly healthy. The reader never hears a word.', 0, 'lost');
      return frames;
    }
    add('Dispatcher finds pending intent', 'A later process reads the pending fact. It needs no memory of the crash.', 0);
  }
  sent = true;
  add('Confirmation sent', 'The message is delivered.', 1, owed ? null : 'ok');
  if (owed) {
    owed = false;
    add('Intent acknowledged', 'Only now does the pending fact clear. Crash before this and the send repeats.', 0, 'ok');
  }
  return frames;
}

export type BackoffKind = 'fixed' | 'exponential';
export interface RetryAttempt {
  attempt: number;
  at: number;
  waited: number;
  outcome: 'failed' | 'succeeded';
}
export interface RetryRun {
  attempts: RetryAttempt[];
  state: 'completed' | 'failed';
  totalMs: number;
}
/** Mirrors BullMQ: `attempts` counts the first try, and the job only fails once the budget is spent. */
export function retryRun(budget: number, kind: BackoffKind, delay: number, failures: number): RetryRun {
  const attempts: RetryAttempt[] = [];
  let at = 0;
  for (let attempt = 1; attempt <= budget; attempt++) {
    const waited = attempt === 1 ? 0 : kind === 'fixed' ? delay : delay * 2 ** (attempt - 2);
    at += waited;
    const outcome = attempt > failures ? 'succeeded' : 'failed';
    attempts.push({ attempt, at, waited, outcome });
    if (outcome === 'succeeded') return { attempts, state: 'completed', totalMs: at };
  }
  return { attempts, state: 'failed', totalMs: at };
}

export type LoaderMode = 'plain' | 'loader';
export interface LoaderFrame {
  title: string;
  detail: string;
  queries: number;
  resolved: number;
  queued: number;
  active: number;
  final: boolean;
}
export function loaderTrace(mode: LoaderMode, issues: number, people: number): LoaderFrame[] {
  const start: LoaderFrame = {
    title: 'The page query runs',
    detail: `One find returns ${issues} issues. Each one holds an assignee id, and the client asked for the name.`,
    queries: 1,
    resolved: 0,
    queued: 0,
    active: 2,
    final: false,
  };
  if (mode === 'loader')
    return [
      start,
      {
        title: 'Every resolver calls load()',
        detail: `${issues} load calls, ${people} distinct ids. Nothing has reached MongoDB: each resolver holds a promise.`,
        queries: 1,
        resolved: 0,
        queued: people,
        active: 1,
        final: false,
      },
      {
        title: 'The tick ends, the batch runs once',
        detail: `DataLoader passes all ${people} ids to your batch function, which sends one find with $in.`,
        queries: 2,
        resolved: 0,
        queued: people,
        active: 2,
        final: false,
      },
      {
        title: 'One answer, every promise settled',
        detail: `The batch returned ${people} users. DataLoader hands the right one to each of the ${issues} resolvers.`,
        queries: 2,
        resolved: issues,
        queued: 0,
        active: 0,
        final: true,
      },
    ];
  const repeats = issues - people;
  return [
    start,
    {
      title: 'The first resolver asks for its user',
      detail: 'findById goes straight to MongoDB. Nothing exists that could wait for the others.',
      queries: 2,
      resolved: 1,
      queued: 0,
      active: 2,
      final: false,
    },
    {
      title: 'The second resolver does the same',
      detail: 'Resolvers cannot see each other, so this is a second query for one field on one card.',
      queries: 3,
      resolved: 2,
      queued: 0,
      active: 2,
      final: false,
    },
    {
      title: repeats > 0 ? 'A resolver repeats a lookup' : 'The third resolver sends its own query',
      detail:
        repeats > 0
          ? 'This assignee was fetched a moment ago. Nothing remembers that, so the same user is read again.'
          : 'Every issue has a different assignee here, and each one still costs a round trip.',
      queries: 4,
      resolved: 3,
      queued: 0,
      active: 2,
      final: false,
    },
    {
      title: `${issues} resolvers later`,
      detail:
        repeats > 0
          ? `${issues} assignee queries for ${people} people, so ${repeats} of them fetched someone already fetched.`
          : `${issues} assignee queries, one for each issue. No repeats, and still one round trip per card.`,
      queries: issues + 1,
      resolved: issues,
      queued: 0,
      active: 2,
      final: true,
    },
  ];
}

export type MutationOutcome = 'success' | 'failure';
export type Status = 'TODO' | 'DONE';
export interface OptimisticFrame {
  title: string;
  detail: string;
  card: Status;
  note: string;
  layer: string;
  cache: Status;
  server: string;
  active: number;
  rolledBack: boolean;
}
export function optimisticTrace(optimistic: boolean, outcome: MutationOutcome): OptimisticFrame[] {
  const before: OptimisticFrame = {
    title: 'Before the click',
    detail: 'TF-7 is in TODO. The card reads that from the normalized cache, like everything else on the board.',
    card: 'TODO',
    note: '',
    layer: 'empty',
    cache: 'TODO',
    server: 'idle',
    active: 2,
    rolledBack: false,
  };
  const failed = outcome === 'failure';
  if (!optimistic)
    return [
      before,
      {
        ...before,
        title: 'Click: the request leaves',
        detail: 'Nothing is written locally, so the card has nothing new to show.',
        note: 'saving…',
        server: 'in flight',
        active: 0,
      },
      {
        ...before,
        title: 'Waiting for the round trip',
        detail: 'The person clicked and the card has not moved. Every millisecond of latency is visible here.',
        note: 'saving…',
        server: 'in flight',
        active: 0,
      },
      failed
        ? {
            ...before,
            title: 'The server refuses',
            detail: 'Nothing changed locally, so there is nothing to undo. The error still needs showing.',
            note: 'error shown',
            server: 'refused',
            active: 0,
          }
        : {
            ...before,
            title: 'The real result arrives',
            detail: 'The response is normalized into the cached issue and the card moves, one round trip after the click.',
            card: 'DONE',
            cache: 'DONE',
            server: 'accepted',
            active: 2,
          },
    ];
  const guessing: OptimisticFrame = {
    ...before,
    title: 'Click: the guess goes on top',
    detail: 'Your optimisticResponse lands in a separate layer. Reads see it first, so the card moves in the same frame.',
    card: 'DONE',
    layer: 'status: DONE',
    server: 'in flight',
    active: 1,
  };
  return [
    before,
    guessing,
    {
      ...guessing,
      title: 'Waiting for the round trip',
      detail: 'The card and the stored cache disagree on purpose. The guess has not touched the data underneath.',
      active: 0,
    },
    failed
      ? {
          ...before,
          title: 'The server refuses: the layer is thrown away',
          detail: 'No undo code ran. Removing the layer leaves the untouched TODO showing, so say why the card moved back.',
          note: 'error shown',
          server: 'refused',
          active: 1,
          rolledBack: true,
        }
      : {
          ...before,
          title: 'The real result replaces the guess',
          detail: 'The layer is removed and the server response is written to the cache. Usually nothing visibly changes.',
          card: 'DONE',
          cache: 'DONE',
          server: 'accepted',
        },
  ];
}
