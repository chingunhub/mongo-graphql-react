export const RELAYDESK_BOOT = 'm21/f21-launch';

export interface ProjectPiece {
  id: string;
  label: string;
  file: string;
  step?: string;
  lesson?: string;
  role: 'build' | 'provided' | 'tooling';
  why: string;
}
export interface ProjectLayer {
  name: string;
  color: string;
  pieces: ProjectPiece[];
}
export const relaydeskLayers: ProjectLayer[] = [
  {
    name: 'React client',
    color: 'var(--react)',
    pieces: [
      {
        id: 'session',
        label: 'Apollo + tRPC session',
        file: 'web/session.ts',
        step: 'm23/f23-session',
        role: 'build',
        why: 'One identity owns one client cache and one set of network credentials. Close it when the identity changes.',
      },
      {
        id: 'inbox',
        label: 'Support inbox',
        file: 'web/SupportInbox.tsx',
        step: 'm23/f23-inbox',
        role: 'build',
        why: 'Read tickets, submit intake, triage with the displayed version and recover from failed requests.',
      },
      {
        id: 'operations',
        label: 'Operations panel',
        file: 'web/OperationsPanel.tsx',
        step: 'm21/f21-console',
        role: 'build',
        why: 'Make pending work, failure and recovery visible without reporting success too early.',
      },
      {
        id: 'documents',
        label: 'Operations + generated types',
        file: 'web/operations.ts',
        lesson: 'm23/l1-client-boundaries',
        role: 'provided',
        why: 'GraphQL documents define the UI data contract. Codegen validates them against the public GraphQL schema.',
      },
    ],
  },
  {
    name: 'Request boundaries',
    color: 'var(--gql)',
    pieces: [
      {
        id: 'identity',
        label: 'HTTP → trusted context',
        file: 'services/http-context.ts',
        step: 'm22/f22-http-context',
        role: 'build',
        why: 'Parse transport values, resolve a credential and preserve request identity across REST, GraphQL and tRPC.',
      },
      {
        id: 'permissions',
        label: 'Membership + permissions',
        file: 'packages/contracts/context.ts',
        step: 'm15/f15-context',
        role: 'build',
        why: 'Selecting an organization is not permission. Every action checks the selected membership.',
      },
      {
        id: 'gateway',
        label: 'Gateway + HTTP routes',
        file: 'runtime/serve.ts',
        lesson: 'm22/l1-http-boundaries',
        role: 'provided',
        why: 'Mount the public transports, compose subgraphs and forward identity. This glue stays supplied and is fully inspectable.',
      },
      {
        id: 'subgraphs',
        label: 'Contacts ↔ tickets',
        file: 'services/subgraphs.ts',
        step: 'm17/f17-subgraphs',
        role: 'build',
        why: 'Entity keys locate records; reference resolvers still enforce the trusted tenant.',
      },
      {
        id: 'triage',
        label: 'tRPC triage',
        file: 'services/triage.ts',
        step: 'm18/f18-triage',
        role: 'build',
        why: 'Parse received input and compare the stored version atomically before a write.',
      },
    ],
  },
  {
    name: 'Durable work',
    color: 'var(--mongo)',
    pieces: [
      {
        id: 'intake',
        label: 'Ticket + opening intent',
        file: 'services/tickets/intake.ts',
        step: 'm16/f16-intake',
        role: 'build',
        why: 'Acceptance and its bounded pending event commit together. Retries keep the same accepted ticket.',
      },
      {
        id: 'receipt',
        label: 'Activity receipt',
        file: 'services/activity/worker.ts',
        step: 'm19/f19-worker',
        role: 'build',
        why: 'A tenant-scoped unique event receipt prevents repeated activity even after a queue job is removed.',
      },
      {
        id: 'transport',
        label: 'Queue lifecycle',
        file: 'services/queue-delivery.ts',
        step: 'm22/f22-queue-transport',
        role: 'build',
        why: 'Own readiness, worker-result waiting and reverse-order cleanup across partial startup failures.',
      },
      {
        id: 'dispatch',
        label: 'Dispatch + recovery',
        file: 'services/operations.ts',
        step: 'm20/f20-dispatch',
        role: 'build',
        why: 'Acknowledge intent after its effect succeeds. A failed acknowledgement must remain safe to retry.',
      },
    ],
  },
  {
    name: 'Composition + tools',
    color: 'var(--forge)',
    pieces: [
      {
        id: 'plugins',
        label: 'Plugin dependencies',
        file: 'packages/contracts/plugins.ts',
        step: 'm14/f14-manifest',
        role: 'build',
        why: 'Reject broken contracts and compute an initialization order that respects dependencies.',
      },
      {
        id: 'lifecycle',
        label: 'Start / stop',
        file: 'services/lifecycle.ts',
        step: 'm21/f21-launch',
        role: 'build',
        why: 'Readiness follows acquired resources. A failed startup must unwind what it opened.',
      },
      {
        id: 'shell',
        label: 'Identity switch + shell',
        file: 'web/App.tsx',
        lesson: 'm23/l2-view-states',
        role: 'provided',
        why: 'Mount the selected identity, session, inbox and operations panel. Domain behavior lives in your components.',
      },
      {
        id: 'nx',
        label: 'Nx project graph',
        file: 'nx.json',
        lesson: 'm14/l2-monorepos',
        role: 'tooling',
        why: 'Project/task dependencies help determine what must be checked after a change; they do not prove runtime reachability.',
      },
      {
        id: 'pnpm',
        label: 'pnpm workspace',
        file: 'pnpm-workspace.yaml',
        lesson: 'm14/l2-monorepos',
        role: 'tooling',
        why: 'Workspace packages and a frozen lock give the exported project reproducible dependency resolution.',
      },
    ],
  },
];
export const relaydeskPieces = relaydeskLayers.flatMap((layer) => layer.pieces);
export type Journey = 'query' | 'triage' | 'delivery' | 'recovery';
export interface JourneyFrame {
  at: string;
  title: string;
  detail: string;
  payload: string;
  intent?: string;
  activities?: number;
}
export function relaydeskJourney(kind: Journey): JourneyFrame[] {
  if (kind === 'query')
    return [
      {
        at: 'inbox',
        title: 'The view asks for data',
        detail:
          'SupportInbox reads the Tickets operation. The completed design queries only the fields the view uses.',
        payload: 'tickets { tenant id subject version contact { tenant id name } }',
      },
      {
        at: 'session',
        title: 'The session sends a GraphQL operation',
        detail:
          'Apollo cache misses travel through the HTTP link with this identity’s credential and selected tenant.',
        payload: 'POST /graphql\nauthorization: Bearer north-agent\nx-relay-tenant: north',
      },
      {
        at: 'identity',
        title: 'Headers become trusted context',
        detail:
          'The credential resolves a membership. The selected tenant must belong to it; the header alone grants nothing.',
        payload: '{ actorId: "ada", tenant: "north", role: "agent", requestId: "req-7" }',
      },
      {
        at: 'subgraphs',
        title: 'Tickets produces a representation',
        detail:
          'The router asks the contact owner for the missing fields. Both key fields must travel with the representation.',
        payload: '{ __typename: "Contact", tenant: "north", id: "c1" }',
      },
      {
        at: 'subgraphs',
        title: 'Contacts enforces its own boundary',
        detail:
          'The reference resolver compares representation and context before querying. A foreign tenant resolves to null.',
        payload: 'Contact.findOne({ tenant: ctx.tenant, id: ref.id }).lean().exec()',
      },
      {
        at: 'session',
        title: 'Apollo stores the result',
        detail:
          'Compound entity keys and a separate session cache keep identity dimensions visible. The React observer renders the new result.',
        payload: 'Contact:{"tenant":"north","id":"c1"} → Mira North',
      },
    ];
  if (kind === 'triage')
    return [
      {
        at: 'inbox',
        title: 'The operator edits the version they saw',
        detail: 'The pending UI disables a second action and keeps an honest error state.',
        payload: '{ ticketId: "t7", priority: "high", expectedVersion: 0 }',
      },
      {
        at: 'session',
        title: 'A typed call crosses HTTP',
        detail: 'tRPC inference helps the caller; it does not replace runtime validation on the server.',
        payload: 'POST /trpc/triage\ncredential + tenant + serialized input',
      },
      {
        at: 'triage',
        title: 'Parse, authorize, compare',
        detail:
          'A strict Zod parser rejects extra identity fields. The write includes tenant, ticket and expected version.',
        payload:
          'findOneAndUpdate({ tenant, _id: ticketId, version: 0 }, { $set: { priority: "high" }, $inc: { version: 1 } })',
      },
      {
        at: 'inbox',
        title: 'Refresh from the accepted result',
        detail:
          'A stale write reports a conflict instead of overwriting newer work. The inbox exposes a retry or refresh; it does not invent success.',
        payload: 'success → refetch; conflict → show error and keep existing data',
      },
    ];
  const frames: JourneyFrame[] = [
    {
      at: 'intake',
      title: 'Accepted work already has durable intent',
      detail: 'The ticket and opening event exist in one document before dispatch begins.',
      payload: 'ticket.opening.delivered = false',
      intent: 'pending',
      activities: 0,
    },
    {
      at: 'dispatch',
      title: 'Dispatch selects pending work',
      detail: 'The selected tenant limits the read. The event identity remains stable across attempts.',
      payload: '{ id: "event-7", tenant: "north", type: "ticket.opened" }',
      intent: 'pending',
      activities: 0,
    },
    {
      at: 'transport',
      title: 'Queue acceptance is not completion',
      detail: 'The queue accepts the job, then the adapter waits on QueueEvents for its worker result.',
      payload: 'job = await enqueueOpening(queue, event)\nawait job.waitUntilFinished(events, 15000)',
      intent: 'pending',
      activities: 0,
    },
    {
      at: 'receipt',
      title: 'The worker commits the effect',
      detail: 'The unique tenant + event ID constraint makes concurrent or repeated attempts converge.',
      payload: 'Activity.create(receipt)\nduplicate key → Activity.findOne({ tenant, eventId })',
      intent: 'pending',
      activities: 1,
    },
  ];
  if (kind === 'recovery')
    frames.push(
      {
        at: 'dispatch',
        title: 'Stop before acknowledgement',
        detail:
          'The receipt exists while intent is still pending. The dispatcher cannot conclude that a failed call means no effect happened.',
        payload: 'process stops after effect, before acknowledgement',
        intent: 'pending',
        activities: 1,
      },
      {
        at: 'transport',
        title: 'Replay the same event',
        detail:
          'Recovery preserves the original event ID. The domain receipt still exists even if the completed queue job was removed.',
        payload: 'same tenant + same event ID → existing receipt',
        intent: 'pending',
        activities: 1,
      },
    );
  frames.push(
    {
      at: 'dispatch',
      title: 'Acknowledge after consumption',
      detail: 'Only a successful consumer result permits the pending flag to change.',
      payload: 'ticket.opening.delivered = true',
      intent: 'acknowledged',
      activities: 1,
    },
    {
      at: 'operations',
      title: 'The view reports persisted state',
      detail: 'The operations panel refreshes counts. One effect remains after recovery.',
      payload: '{ pending: 0, activities: 1 }',
      intent: 'acknowledged',
      activities: 1,
    },
  );
  return frames;
}
