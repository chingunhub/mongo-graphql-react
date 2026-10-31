// Grader check for the whole course: wrong solutions must be KILLED by the tests, valid alternatives must SURVIVE.
// A mutant whose edit no longer applies is a failure too, so a changed solution can't quietly retire one.
// npm run verify:mutants [-- taskfilter]
import { loadCurriculum, taskSolution, type TaskItem } from '../../server/content.js';
import { runJob } from '../../server/runner.js';
import { addTaskforgeMutants } from './mutants-taskforge.js';

type R = [string, string];
type M = { task: string; name: string; file: string; edits?: R[]; whole?: string; alt?: boolean };
const ms: M[] = [];
const bug = (task: string, name: string, file: string, ...edits: R[]) => ms.push({ task, name, file, edits });
const whole = (task: string, name: string, file: string, src: string, alt = false) =>
  ms.push({ task, name, file, whole: src, alt });
const alt = (task: string, name: string, file: string, ...edits: R[]) => ms.push({ task, name, file, edits, alt: true });

// --- m14
const P = 'packages/contracts/plugins.ts';
bug('f14-manifest', 'requires not sorted (order depends on input)', P, ['[...plugin.requires].sort()', 'plugin.requires']);
bug('f14-manifest', 'roots not sorted', P, ['[...byName.keys()].sort()', '[...byName.keys()]']);
bug('f14-manifest', 'version never checked', P, [`if (plugin.version !== 1) throw new Error('Unsupported version: ' + plugin.name);`, '']);
bug('f14-manifest', 'duplicates silently overwrite', P, [`if (byName.has(plugin.name)) throw new Error('Duplicate plugin: ' + plugin.name);`, '']);
bug('f14-manifest', 'active set never cleared (false cycle on diamonds)', P, ['active.delete(name);', '']);
whole('f14-manifest', 'ALT Kahn topological sort with sorted queue', P, `export type Plugin = { name: string; version: number; requires: string[] };
export function orderPlugins(plugins: Plugin[]): string[] {
  const byName = new Map<string, Plugin>();
  for (const plugin of plugins) {
    if (byName.has(plugin.name)) throw new Error('Duplicate plugin: ' + plugin.name);
    if (plugin.version !== 1) throw new Error('Unsupported version: ' + plugin.name);
    byName.set(plugin.name, plugin);
  }
  const left = new Map<string, Set<string>>();
  for (const p of byName.values()) {
    for (const r of p.requires) if (!byName.has(r)) throw new Error('Missing dependency: ' + r);
    left.set(p.name, new Set(p.requires));
  }
  const out: string[] = [];
  while (left.size) {
    const next = [...left.keys()].filter((n) => left.get(n)!.size === 0).sort()[0];
    if (!next) throw new Error('Dependency cycle: ' + [...left.keys()].sort()[0]);
    left.delete(next);
    for (const s of left.values()) s.delete(next);
    out.push(next);
  }
  return out;
}
`, true);

// --- m15
const L = 'loader.ts';
bug('d1-scoped-loader', 'no tenant filter on returned rows', L, ['rows.filter((row) => row.tenant === tenant)', 'rows']);
bug('d1-scoped-loader', 'rows returned in database order', L, ['return ids.map((id) => byId.get(id) ?? null);', 'return rows;']);
bug('d1-scoped-loader', 'missing -> undefined instead of null', L, ['byId.get(id) ?? null', 'byId.get(id) as any']);
bug('d1-scoped-loader', 'one module-global loader shared by all tenants', L,
  ['export function bookingLoader(', 'let shared: any;\nexport function bookingLoader('],
  ['return new DataLoader<string, Booking | null>(', 'return shared ??= new DataLoader<string, Booking | null>(']);
const C = 'packages/contracts/context.ts';
bug('f15-context', 'requireAction without own-key check', C, ['!Object.hasOwn(actions, context.role) || ', '']);
bug('f15-context', 'blank request id accepted', C, [`if (!requestId.trim()) throw new Error('BAD_REQUEST');`, '']);
bug('f15-context', 'actor is the role, not the id', C, ['actorId: principal.id', 'actorId: role']);
bug('f15-context', 'reader may triage', C, [`reader: ['tickets:read'],`, `reader: ['tickets:read', 'tickets:triage'],`]);

// --- m16
const S = 'claim.ts';
whole('d1-seat-claim', 'read-then-save', S, `import { Seat } from './model';
export async function claimSeat(id: string, expectedVersion: number): Promise<boolean> {
  const seat = await Seat.findOne({ _id: id, status: 'available', version: expectedVersion });
  if (!seat) return false;
  seat.status = 'reserved';
  seat.version += 1;
  await seat.save();
  return true;
}
`);
bug('d1-seat-claim', 'version missing from filter', S, [', version: expectedVersion }', ' }']);
bug('d1-seat-claim', 'status missing from filter', S, [`status: 'available', version`, 'version']);
bug('d1-seat-claim', 'version never increments', S, [', $inc: { version: 1 }', '']);
alt('d1-seat-claim', 'ALT findOneAndUpdate !== null', S, ['Seat.updateOne(', 'Seat.findOneAndUpdate('], ['return result.matchedCount === 1;', 'return result !== null;']);
const I = 'services/tickets/intake.ts';
bug('f16-intake', 'no duplicate-key recovery', I, [`if ((error as { code?: number }).code !== 11000) throw error;`, 'throw error;']);
bug('f16-intake', 'catch-all that rethrows only if nothing found', I, [`if ((error as { code?: number }).code !== 11000) throw error;`, '']);
bug('f16-intake', '$set instead of $setOnInsert', I, ['{ $setOnInsert: document }', '{ $set: (({ _id, ...d }) => d)(document) }']);
bug('f16-intake', 'filter forgets tenant', I, ['const filter = { tenant: ctx.tenant, sourceId: input.sourceId };', 'const filter = { sourceId: input.sourceId };'], ['    ...filter,\n', '    ...filter,\n    tenant: ctx.tenant,\n']);
bug('f16-intake', 'event id differs from ticket id', I, ['      id: String(id),\n', '      id: String(new Types.ObjectId()),\n']);
bug('f16-intake', 'no authorization', I, [`requireAction(ctx, 'tickets:triage');`, '']);
const IM = 'services/tickets/model.ts';
alt('f16-intake', 'ALT create() then catch 11000', I, [`    return (await Ticket.findOneAndUpdate(
      filter,
      { $setOnInsert: document },
      { upsert: true, returnDocument: 'after', runValidators: true },
    ).lean())!;`, `    return (await Ticket.create(document)).toObject() as any;`]);

// --- m17
const G = 'services/subgraphs.ts';
bug('f17-subgraphs', 'guard only on Query, not __resolveReference', G, [`__resolveReference: (ref: { tenant: string; id: string }, ctx: Context) => {
            requireAction(ctx, 'tickets:read');`, `__resolveReference: (ref: { tenant: string; id: string }, ctx: Context) => {`]);
bug('f17-subgraphs', 'trusts ref.tenant', G, ['if (ref.tenant !== ctx.tenant) return null;\n', ''], ['Contact.findOne({ tenant: ctx.tenant, id: ref.id })', 'Contact.findOne({ tenant: ref.tenant, id: ref.id })']);
bug('f17-subgraphs', 'no mismatch check: other tenant ref silently resolves to own contact', G, ['if (ref.tenant !== ctx.tenant) return null;\n', '']);
bug('f17-subgraphs', 'Query.contact not tenant filtered', G, ['Contact.findOne({ tenant: ctx.tenant, id }).lean()', 'Contact.findOne({ id }).lean()']);
bug('f17-subgraphs', 'tickets not tenant filtered', G, ['Ticket.find({ tenant: ctx.tenant })', 'Ticket.find({})']);
bug('f17-subgraphs', 'tickets unguarded', G, [`tickets: (_: unknown, _args: unknown, ctx: Context) => {
            requireAction(ctx, 'tickets:read');`, `tickets: (_: unknown, _args: unknown, ctx: Context) => {`]);
bug('f17-subgraphs', 'stub missing tenant', G, ['tenant: row.tenant,\n            id: row.contactId', 'id: row.contactId']);

// --- m18
const T = 'services/triage.ts';
bug('f18-triage', 'no tenant filter', T, ['            tenant: ctx.tenant,\n', '']);
bug('f18-triage', 'no version guard', T, ['            version: input.expectedVersion,\n', '']);
bug('f18-triage', 'no $inc', T, [', $inc: { version: 1 }', '']);
bug('f18-triage', 'input not strict', T, ['          .strict(),\n', '          ,\n']);
bug('f18-triage', 'raw Error leaks as 500', T, [`try {
          requireAction(ctx, 'tickets:triage');
        } catch {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }`, `requireAction(ctx, 'tickets:triage');`]);
bug('f18-triage', 'authorization after the write', T,
  [`try {
          requireAction(ctx, 'tickets:triage');
        } catch {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }`, ''],
  ['        if (!row)\n', `        try { requireAction(ctx, 'tickets:triage'); } catch { throw new TRPCError({ code: 'FORBIDDEN' }); }\n        if (!row)\n`]);
bug('f18-triage', 'NOT_FOUND instead of CONFLICT', T, [`code: 'CONFLICT'`, `code: 'NOT_FOUND'`]);
bug('f18-triage', 'ticketId any string', T, ['z.string().regex(/^[a-f0-9]{24}$/i)', 'z.string()']);

// --- m19
const W = 'services/activity/worker.ts';
bug('f19-worker', 'catch-all treats every failure as duplicate', W, [`if ((error as { code?: number }).code !== 11000) throw error;`, '']);
bug('f19-worker', 'duplicate branch removed', W, [`if ((error as { code?: number }).code !== 11000) throw error;`, 'throw error;']);
bug('f19-worker', 'check-then-insert race', W, ['  try {\n    const row = await Activity.create({', `  const seen = await Activity.findOne({ tenant: event.tenant, eventId: event.id }).lean();
  if (seen) return { id: String(seen._id), duplicate: true };
  try {
    const row = await Activity.create({`], [`if ((error as { code?: number }).code !== 11000) throw error;`, 'throw error;']);
bug('f19-worker', 'unique index on eventId only', W, ['schema.index({ tenant: 1, eventId: 1 }, { unique: true });', 'schema.index({ eventId: 1 }, { unique: true });']);
bug('f19-worker', 'jobId ignores tenant', W, ['JSON.stringify([event.tenant, event.id])', 'JSON.stringify([event.id])']);
bug('f19-worker', 'jobId tenant:id (colon is rejected by BullMQ)', W, [`createHash('sha256')
    .update(JSON.stringify([event.tenant, event.id]))
    .digest('hex')`, '`${event.tenant}:${event.id}`']);
bug('f19-worker', 'jobId ambiguous concat a+b', W, [`createHash('sha256')
    .update(JSON.stringify([event.tenant, event.id]))
    .digest('hex')`, 'event.tenant + event.id']);
bug('f19-worker', 'no retries', W, ['attempts: 4,', 'attempts: 1,']);
bug('f19-worker', 'event schema not strict', W, ['  .strict();', '  ;']);
bug('f19-worker', 'enqueue does not validate', W, ['const event = openingEvent.parse(input);\n  const jobId', 'const event = input as OpeningEvent;\n  const jobId']);
bug('d1-retry-budget', 'off by one', 'retry.ts', ['2 ** (attemptsMade - 1)', '2 ** attemptsMade']);
bug('d1-retry-budget', 'attempts >', 'retry.ts', ['attemptsMade >= maxAttempts', 'attemptsMade > maxAttempts']);
bug('d1-retry-budget', 'no cap', 'retry.ts', ['Math.min(maxDelay, baseDelay * 2 ** (attemptsMade - 1))', 'baseDelay * 2 ** (attemptsMade - 1)']);

// --- m20
const O = 'services/operations.ts';
bug('f20-dispatch', 'ack before delivery', O, ['      await deliver(event);\n', ''], ['      delivered++;\n', '      await deliver(event);\n      delivered++;\n']);
bug('f20-dispatch', 'ack in finally', O, [`      await deliver(event);
      const result = await Ticket.updateOne(
        { _id: ticket._id, tenant: ctx.tenant, 'event.id': event.id },
        { $set: { 'event.delivered': true } },
      );
      if (result.matchedCount !== 1) throw Error('Acknowledgement lost');
      delivered++;`, `      try {
        await deliver(event);
        delivered++;
      } finally {
        await Ticket.updateOne({ _id: ticket._id, tenant: ctx.tenant }, { $set: { 'event.delivered': true } });
      }`]);
bug('f20-dispatch', 'one failure aborts the batch', O, ['    } catch {\n      failed++;\n    }', '    } catch (e) {\n      failed++;\n      throw e;\n    }']);
bug('f20-dispatch', 'dispatches every tenant', O, [`Ticket.find({
    tenant: ctx.tenant,
    'event.delivered': false,
  })`, `Ticket.find({ 'event.delivered': false })`]);
bug('f20-dispatch', 'identity check removed', O, [`if (event.tenant !== ctx.tenant || event.ticketId !== String(ticket._id)) throw Error('Invalid event identity');`, '']);
bug('f20-dispatch', 'lost ack not detected', O, [`if (result.matchedCount !== 1) throw Error('Acknowledgement lost');`, '']);
bug('f20-dispatch', 'report across tenants', O, ['Activity.countDocuments({ tenant: ctx.tenant })', 'Activity.countDocuments({})']);
bug('f20-dispatch', 'report wrong permission', O, [`requireAction(ctx, 'tickets:read');`, '']);
bug('f20-dispatch', 'dispatch unguarded', O, [`requireAction(ctx, 'tickets:triage');`, '']);
alt('f20-dispatch', 'ALT deliver concurrently with allSettled', O,
  ['  for (const ticket of tickets) {\n    try {', '  await Promise.all(tickets.map(async (ticket) => {\n    try {'],
  ['      failed++;\n    }\n  }\n', '      failed++;\n    }\n  }));\n']);

// --- m21
const B = 'services/lifecycle.ts';
bug('f21-launch', 'stop not memoized', B, ['(stopping ??= (async () => {', '((async () => {']);
bug('f21-launch', 'boolean guard: second caller resolves early', B,
  ['let stopping: Promise<void> | undefined;', 'let stopped = false;'],
  [`stop: () =>
      (stopping ??= (async () => {
        try {
          await running!.stop();
        } finally {
          await deps.disconnect();
        }
      })()),`, `stop: async () => {
      if (stopped) return;
      stopped = true;
      try {
        await running!.stop();
      } finally {
        await deps.disconnect();
      }
    },`]);
bug('f21-launch', 'disconnect skipped when stop rejects', B, [`try {
          await running!.stop();
        } finally {
          await deps.disconnect();
        }`, `await running!.stop();
        await deps.disconnect();`]);
bug('f21-launch', 'disconnect failure masks boot error', B, [`try {
      await deps.disconnect();
    } catch {}`, 'await deps.disconnect();']);
bug('f21-launch', 'no cleanup on boot failure', B, [`try {
      await deps.disconnect();
    } catch {}
    throw error;`, 'throw error;']);
bug('f21-launch', 'serves before indexes', B, ['    await deps.ensureIndexes();\n    running = await deps.serve();', '    running = await deps.serve();\n    await deps.ensureIndexes();']);

// --- m22
const H = 'services/http-context.ts';
bug('f22-http-context', 'token lookup without own-key check', H, ['!Object.hasOwn(principals, token)', '!principals[token]']);
bug('f22-http-context', 'blank tenant accepted', H, [`if (typeof tenant !== 'string' || !tenant.trim()) throw`, `if (typeof tenant !== 'string') throw`]);
bug('f22-http-context', 'request id charset unchecked', H, ['!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)', 'false']);
bug('f22-http-context', 'context errors escape unmapped', H, [`try {
    return {
      ...buildContext(principals[token], tenant, requestId),
      credential,
    };
  } catch (error) {`, `return { ...buildContext(principals[token], tenant, requestId), credential };
  try {} catch (error) {`]);
bug('f22-http-context', 'credential dropped from context', H, ['      credential,\n    };', '      credential: \'\',\n    };']);
bug('f22-http-context', 'unknown errors rewritten as 400', H, ['if (!Object.hasOwn(codes, message)) throw error;', `if (!Object.hasOwn(codes, message)) throw new TRPCError({ code: 'BAD_REQUEST' });`]);
const Q = 'services/queue-delivery.ts';
bug('f22-queue-transport', 'no cleanup on open failure', Q, [`try {
      await close();
    } catch {}
    throw error;`, 'throw error;']);
bug('f22-queue-transport', 'cleanup failure masks open error', Q, [`try {
      await close();
    } catch {}
    throw error;`, 'await close();\n    throw error;']);
bug('f22-queue-transport', 'close not idempotent', Q, ['return (cleanup ??= (async () => {', 'return ((async () => {']);
bug('f22-queue-transport', 'first close failure skips the rest', Q, [`if (resource)
          try {
            await resource.close();
          } catch (error) {
            errors.push(error);
          }`, 'if (resource) await resource.close();']);
bug('f22-queue-transport', 'cleanup errors swallowed', Q, [`if (errors.length) throw new AggregateError(errors, 'Queue cleanup failed');`, '']);
bug('f22-queue-transport', 'connection leaked', Q, [`if (connection)
        try {
          connection.disconnect();
        } catch (error) {
          errors.push(error);
        }`, '']);
bug('f22-queue-transport', 'queue closed before worker', Q, ['[worker, events, queue]', '[queue, events, worker]']);
bug('f22-queue-transport', 'no timeout', Q, ['job.waitUntilFinished(readyEvents, deps.timeoutMs)', 'job.waitUntilFinished(readyEvents)']);
bug('f22-queue-transport', 'deliver after close allowed', Q, [`if (closed) throw Error('CLOSED');`, '']);
bug('f22-queue-transport', 'does not wait for readiness', Q, ['    await Promise.all([queue.waitUntilReady(), events.waitUntilReady(), worker.waitUntilReady()]);\n', '']);
bug('f22-queue-transport', 'no ping', Q, ['    await connection.ping();\n', '']);

// --- m23
const SS = 'web/session.ts';
bug('f23-session', 'shares caller header object', SS, ['const headers = { ...options.headers };', 'const headers = options.headers;']);
bug('f23-session', 'Ticket identity not compound', SS, [`Ticket: { keyFields: ['tenant', 'id'] },`, '']);
bug('f23-session', 'Contact identity not compound', SS, [`Contact: { keyFields: ['tenant', 'id'] },`, '']);
bug('f23-session', 'fetcher not given to tRPC', SS, [`httpBatchLink({ url: endpoint('trpc'), headers, fetch: fetcher })`, `httpBatchLink({ url: endpoint('trpc'), headers })`]);
bug('f23-session', 'headers not given to tRPC', SS, [`httpBatchLink({ url: endpoint('trpc'), headers, fetch: fetcher })`, `httpBatchLink({ url: endpoint('trpc'), fetch: fetcher })`]);
bug('f23-session', 'HTTP errors ignored', SS, [`if (!response.ok)
      throw Error(typeof result.error === 'string' ? result.error : 'HTTP ' + response.status);
`, '']);
bug('f23-session', 'triage after stop allowed', SS, [`triage: async (input) => {
        assertOpen();`, 'triage: async (input) => {']);
bug('f23-session', 'REST after stop allowed', SS, ['  async function request(path: string, body?: unknown) {\n    assertOpen();', '  async function request(path: string, body?: unknown) {']);
bug('f23-session', 'stop does not stop Apollo', SS, ['client.stop();', '']);
bug('f23-session', 'dispatch omits body', SS, [`request('api/dispatch', { simulateFailure })`, `request('api/dispatch', {})`]);
alt('f23-session', 'ALT endpoint by string join', SS, ['new URL(path, options.baseUrl).href', "options.baseUrl.replace(/\\/$/, '') + '/' + path"]);
const SI = 'web/SupportInbox.tsx';
bug('f23-inbox', 'stale generation guards removed from actions', SI, ['      if (own !== generation.current) return;\n      changed();', '      changed();'], ['      if (own !== generation.current) return;\n      setMessage(\'Priority updated\');', "      setMessage('Priority updated');"]);
bug('f23-inbox', 'stale failure shown', SI, ['if (own === generation.current) setFailure((error as Error).message);', 'setFailure((error as Error).message);']);
bug('f23-inbox', 'no double-submit guard', SI, ['    if (inFlight.current) return;\n', '']);
bug('f23-inbox', 'never resets on api change', SI, ['  }, [api, clearErrors]);', '  }, []);']);
bug('f23-inbox', 'expectedVersion hard-coded', SI, ['expectedVersion: ticket.version,', 'expectedVersion: 0,']);
bug('f23-inbox', 'no refetch after triage', SI, [`setMessage('Priority updated');\n      await refetch();`, `setMessage('Priority updated');`]);
bug('f23-inbox', 'no refetch after accept', SI, [`setMessage('Accepted ' + result.id);\n      await refetch();`, `setMessage('Accepted ' + result.id);`]);
bug('f23-inbox', 'changed() not called', SI, ['      changed();\n', '']);
bug('f23-inbox', 'empty state shown during loading/error', SI, ['{!loading && !error && data?.tickets.length === 0 && <p>No tickets yet</p>}', '{!data?.tickets.length && <p>No tickets yet</p>}']);
bug('f23-inbox', 'null contact crashes', SI, [`ticket.contact?.name ?? 'Contact unavailable'`, 'ticket.contact!.name']);
bug('f23-inbox', 'error alert missing', SI, ['{error && <p role="alert">{error.message}</p>}', '']);
bug('f23-inbox', 'buttons never disabled', SI, ['<button disabled={busy}>Accept ticket</button>', '<button>Accept ticket</button>']);
bug('f23-inbox', 'subject untrimmed', SI, [`subject: z.string().trim().min(1, 'Subject is required')`, `subject: z.string().min(1, 'Subject is required')`]);

// --- Module 24 -------------------------------------------------------------
const multi = (task: string, name: string, file: string, edits: R[], also: any[], isAlt = false) =>
  ms.push({ task, name, file, edits, also, alt: isAlt } as any);

const D1T = 'db/models/Tickets.ts';
const D1C = 'connectionResolvers.ts';
bug('d1-model-class', 'duplicate source id rethrown', D1T, [`if (error?.code !== 11000) throw error;`, `throw error;`]);
bug('d1-model-class', 'every create error swallowed', D1T, [`if (error?.code !== 11000) throw error;\n`, '']);
bug('d1-model-class', 'close has no status precondition', D1T, [`{ _id, status: 'open' },`, `{ _id },`]);
bug('d1-model-class', 'close is read-then-save', D1T, [
  `const closed = await models.Tickets.findOneAndUpdate(
        { _id, status: 'open' },
        { $set: { status: 'closed' } },
        { returnDocument: 'after' },
      );
      if (closed) return closed;
      await models.Tickets.getTicket(_id);
      throw new Error('Ticket already closed');`,
  `const ticket = await models.Tickets.getTicket(_id);
      if ((ticket as any).status !== 'open') throw new Error('Ticket already closed');
      await new Promise((r) => setTimeout(r, 5));
      (ticket as any).status = 'closed';
      return ticket.save();`]);
bug('d1-model-class', 'missing ticket reported as already closed', D1T, [`      await models.Tickets.getTicket(_id);\n`, '']);
bug('d1-model-class', 'all tenants share models', D1C, [`const existing = loaded.get(subdomain);`, `const existing = [...loaded.values()][0];`]);
bug('d1-model-class', 'subdomain not validated', D1C, [`if (!/^[a-z0-9-]{1,20}$/.test(subdomain)) throw new Error('Invalid subdomain');\n`, '']);
bug('d1-model-class', 'init not awaited', D1C, [`    await models.Tickets.init();\n`, '']);
bug('d1-model-class', 'cached only after init', D1C,
  [`  loaded.set(subdomain, pending);\n  return pending;`, `  const models = await pending;\n  loaded.set(subdomain, pending);\n  return models;`]);
bug('d1-model-class', 'class closes over a module global', D1C,
  [`models.Tickets = db.model<ITicket, ITicketModel>('tickets', loadTicketClass(models));`, `(globalThis as any).__m ??= models;\n  models.Tickets = db.model<ITicket, ITicketModel>('tickets', loadTicketClass((globalThis as any).__m));`]);

const D2 = 'permissions.ts';
bug('d2-guards', 'isOwner is only truthy', D2, [`user.isOwner === true`, `user.isOwner`]);
bug('d2-guards', 'can ignores missing id', D2, [`if (!user || !user._id) return false;\n  if (user.isOwner`, `if (!user) return false;\n  if (user.isOwner`]);
bug('d2-guards', 'checkLogin ignores missing id', D2, [`if (!user || !user._id) throw new Error('Login required');`, `if (!user) throw new Error('Login required');`]);
bug('d2-guards', 'wrapper only runs first checker', D2, [`for (const checker of checkers) checker(context.user);`, `checkers[0]?.(context.user);`]);
bug('d2-guards', 'wrapper drops resolver args', D2, [`for (const checker of checkers) checker(context.user);\n    return oldMethod(root, args, context, info);`, `for (const checker of checkers) checker(context.user);\n    return oldMethod(root, {}, context, info);`]);
bug('d2-guards', 'checker not given the user', D2, [`checker(context.user)`, `checker(context)`]);
bug('d2-guards', 'checkPermission skips login', D2, [`    checkLogin(context.user);\n    if (!can(`, `    if (!can(`]);
bug('d2-guards', 'falsy default value lost', D2, [`if (defaultValue !== undefined) return defaultValue;`, `if (defaultValue) return defaultValue;`]);
bug('d2-guards', 'module guard drops default', D2, [`checkPermission(mdl, method, action, defaultValue);`, `checkPermission(mdl, method, action);`]);
bug('d2-guards', 'module login only wraps first', D2, [`for (const method of Object.keys(mdl)) requireLogin(mdl, method);`, `requireLogin(mdl, Object.keys(mdl)[0]);`]);
bug('d2-guards', 'module permission only wraps first', D2, [`for (const method of Object.keys(mdl)) checkPermission(mdl, method, action, defaultValue);`, `checkPermission(mdl, Object.keys(mdl)[0], action, defaultValue);`]);

const D3 = 'subscriptions.ts';
bug('d3-live-tickets', 'list not filtered by tenant', D3, [`      if (payload.subdomain !== context.subdomain) return false;\n`, '']);
bug('d3-live-tickets', 'detail channel has no tenant', D3, ['`ticketChanged:${subdomain}:${_id}`', '`ticketChanged:${_id}`']);
bug('d3-live-tickets', 'detail subscribe unguarded', D3, [`        requireLogin(context);\n        return pubsub.asyncIterableIterator(`, `        return pubsub.asyncIterableIterator(`]);
bug('d3-live-tickets', 'list subscribe unguarded', D3, [`        requireLogin(context);\n        return listChanges(`, `        return listChanges(`]);
bug('d3-live-tickets', 'priority ignored', D3, [`return !variables.priority || payload.ticketListChanged.priority === variables.priority;`, `return true;`]);
bug('d3-live-tickets', 'no priority means nothing', D3, [`return !variables.priority || payload.`, `return payload.`]);
bug('d3-live-tickets', 'publish skips list', D3, [`  await pubsub.publish('ticketListChanged', { subdomain, ticketListChanged: ticket });\n`, '']);
bug('d3-live-tickets', 'publish skips detail', D3, [`  await pubsub.publish(detailChannel(subdomain, ticket._id), { ticketChanged: ticket });\n`, '']);
bug('d3-live-tickets', 'login checked only inside filter', D3,
  [`      if (payload.subdomain !== context.subdomain) return false;\n`, `      if (!context.user?._id) return false;\n      if (payload.subdomain !== context.subdomain) return false;\n`],
  [`        requireLogin(context);\n        return listChanges(`, `        return listChanges(`]);

const D4 = 'TicketBoard.tsx';
const D4Q = 'useQueryState.ts';
bug('d4-ticket-board', 'query state lives in useState', D4Q,
  [`import { useSearchParams } from 'react-router';`, `import { useState } from 'react';`],
  [`const [searchParams, setSearchParams] = useSearchParams();`, `const [state, setState] = useState<string | null>(null);`],
  [`    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    });
`, `    setState(value);\n`],
  [`return [searchParams.get(key), setValue];`, `return [state, setValue];`]);
bug('d4-ticket-board', 'setter wipes other params', D4Q, [`const next = new URLSearchParams(previous);`, `const next = new URLSearchParams();`]);
bug('d4-ticket-board', 'clear leaves an empty param', D4Q, [`if (value === null) next.delete(key);\n      else next.set(key, value);`, `next.set(key, value ?? '');`]);
bug('d4-ticket-board', 'selection is local state', D4,
  [`const [selected, setSelected] = useAtom(selectedTicketIdsAtom);`, `const [selected, setSelected] = useState<string[]>([]);`],
  [`import { useAtom } from 'jotai';\n`, ''],
  [`import { selectedTicketIdsAtom } from './state';\n`, '']);
bug('d4-ticket-board', 'rows keyed by index', D4, [`    getRowId: (ticket) => ticket._id,\n`, '']);
bug('d4-ticket-board', 'toggle only adds', D4, [`(ids.includes(_id) ? ids.filter((id) => id !== _id) : [...ids, _id])`, `[...ids, _id]`]);
bug('d4-ticket-board', 'filter only on data length', D4, [`{visible.length === 0 ? (`, `{tickets.length === 0 ? (`]);
bug('d4-ticket-board', 'sort not wired', D4, [`    getSortedRowModel: getSortedRowModel(),\n`, '']);
alt('d4-ticket-board', 'uncontrolled sorting is fine', D4, [`    state: { sorting },\n    onSortingChange: setSorting,\n`, '']);
bug('d4-ticket-board', 'filter ignored', D4, [`(priority ? tickets.filter((ticket) => ticket.priority === priority) : tickets)`, `tickets`]);
bug('d4-ticket-board', 'select not reflecting url', D4, [`value={priority ?? ''} onChange`, `defaultValue="" onChange`]);

const D5M = 'main.ts';
const D5R = 'modules/tickets/graphql/resolvers.ts';
const D5L = 'modules/tickets/graphql/loaders.ts';
const D5T = 'modules/tickets/trpc.ts';
const D5D = 'modules/tickets/db/models/Tickets.ts';
bug('d5-plugin', 'loaders shared across requests', D5M,
  [`export function startTickets() {`, `const shared = new Map<string, ReturnType<typeof createLoaders>>();\nexport function startTickets() {`],
  [`context.loaders = createLoaders(subdomain);`, `if (!shared.has(subdomain)) shared.set(subdomain, createLoaders(subdomain));\n      context.loaders = shared.get(subdomain);`]);
bug('d5-plugin', 'one loader for all tenants', D5M,
  [`export function startTickets() {`, `let shared: ReturnType<typeof createLoaders>;\nexport function startTickets() {`],
  [`context.loaders = createLoaders(subdomain);`, `context.loaders = shared ??= createLoaders(subdomain);`]);
bug('d5-plugin', 'reference resolver unguarded', D5R, [`    checkLogin(user);\n    return models.Tickets.findOne({ _id });`, `    return models.Tickets.findOne({ _id });`]);
bug('d5-plugin', 'raise needs no permission', D5R, [`checkPermission(ticketMutations, 'ticketRaise', 'tickets:manage');\n`, '']);
bug('d5-plugin', 'queries need no login', D5R, [`moduleRequireLogin(ticketQueries);\n`, '']);
bug('d5-plugin', 'mutations need no login', D5R, [`moduleRequireLogin(ticketMutations);\n`, '', ], [`checkPermission(ticketMutations, 'ticketRaise', 'tickets:manage');\n`, '']);
bug('d5-plugin', 'query ignores priority', D5R, [`models.Tickets.find(priority ? { priority } : {})`, `models.Tickets.find({})`]);
bug('d5-plugin', 'contact bypasses loader', D5R,
  [`import { checkLogin, checkPermission, moduleRequireLogin } from '../../../erxes-api-shared';`, `import { checkLogin, checkPermission, moduleRequireLogin, sendTRPCMessage } from '../../../erxes-api-shared';`],
  [`contact({ contactId }: ITicket, _args: unknown, { loaders }: IContext) {
    return contactId ? loaders.contact.load(contactId) : null;`, `async contact({ contactId }: ITicket, _args: unknown, { subdomain }: IContext) {
    if (!contactId) return null;
    const rows = await sendTRPCMessage({ subdomain, pluginName: 'contacts', module: 'contacts', action: 'find', input: { ids: [contactId] }, defaultValue: [] });
    return rows[0] ?? null;`]);
bug('d5-plugin', 'loader keeps server order', D5L, [`return ids.map((id) => byId.get(id) ?? null);`, `return contacts as any;`]);
bug('d5-plugin', 'loader has no default', D5L, [`      defaultValue: [],\n`, '']);
bug('d5-plugin', 'tRPC count ignores priority', D5T, [`countDocuments(input.priority ? { priority: input.priority } : {})`, `countDocuments({})`]);
bug('d5-plugin', 'raise of missing ticket returns null', D5D, [`      if (!ticket) throw new Error('Ticket not found');\n      return ticket;\n    }\n  }\n`, `      return ticket;\n    }\n  }\n`]);
bug('d5-plugin', 'tRPC context has no models', D5M, [`      createContext: async (subdomain, context) => {\n        context.models = await generateModels(subdomain);\n        return context;\n      },`, `      createContext: async (subdomain, context) => context,`]);

const BA = 'api.ts';
const BC = 'connectionResolvers.ts';
const BS = 'modules/reports/summary.ts';
const BT = 'modules/tickets/db/models/Tickets.ts';
const BM = 'utils/memo.ts';
const globalActive: any = [BC,
  [`const loaded = new Map<string, Promise<IModels>>();`, `const loaded = new Map<string, Promise<IModels>>();\nlet active: IModels;\nexport const currentModels = () => active;`],
  [`  return pending;\n};`, `  const models = await pending;\n  active = models;\n  return models;\n};`]];
multi('b1-incident', 'memo keyed but ticket methods keep the global', BT, [
  [`import type { IModels } from '../../../../connectionResolvers';`, `import { currentModels, type IModels } from '../../../../connectionResolvers';`],
  [`const ticket = await models.Tickets.findOne({ _id });`, `const ticket = await currentModels().Tickets.findOne({ _id });`],
  [`const ticket = await models.Tickets.findOneAndUpdate(`, `const ticket = await currentModels().Tickets.findOneAndUpdate(`],
  [`models.Tickets.countDocuments({ status: 'open' })`, `currentModels().Tickets.countDocuments({ status: 'open' })`],
  [`models.Tickets.countDocuments({ status: 'closed' })`, `currentModels().Tickets.countDocuments({ status: 'closed' })`],
], [globalActive]);
multi('b1-incident', 'only summarize keeps the global', BT, [
  [`import type { IModels } from '../../../../connectionResolvers';`, `import { currentModels, type IModels } from '../../../../connectionResolvers';`],
  [`models.Tickets.countDocuments({ status: 'open' })`, `currentModels().Tickets.countDocuments({ status: 'open' })`],
  [`models.Tickets.countDocuments({ status: 'closed' })`, `currentModels().Tickets.countDocuments({ status: 'closed' })`],
], [globalActive]);
multi('b1-incident', 'models fixed but memo still global', BS, [
  [`memo('summary', [subdomain], ONE_MINUTE`, `memo('summary', [], ONE_MINUTE`],
], [[BA, [`clearMemo('summary', [subdomain]);`, `clearMemo('summary');`]]]);
multi('b1-incident', 'memo keyed but invalidation misses the key', BA, [
  [`clearMemo('summary', [subdomain]);`, `clearMemo('summary');`],
], []);
bug('b1-incident', 'create does not invalidate', BA, [`  const ticket = await models.Tickets.create({ subject });\n  clearMemo('summary', [subdomain]);\n`, `  const ticket = await models.Tickets.create({ subject });\n`]);
bug('b1-incident', 'close does not invalidate', BA, [`  const ticket = await models.Tickets.closeTicket(_id);\n  clearMemo('summary', [subdomain]);\n`, `  const ticket = await models.Tickets.closeTicket(_id);\n`]);
bug('b1-incident', 'invalidates before the write', BA, [`  const ticket = await models.Tickets.closeTicket(_id);\n  clearMemo('summary', [subdomain]);\n`, `  clearMemo('summary', [subdomain]);\n  const ticket = await models.Tickets.closeTicket(_id);\n`]);
bug('b1-incident', 'summary loses session check', BA, [`  await checkSession(models, userId);\n  return buildSummary(models, subdomain);`, `  return buildSummary(models, subdomain);`]);
bug('b1-incident', 'memo removed entirely', BS, [`memo('summary', [subdomain], ONE_MINUTE, () => models.Tickets.summarize())`, `models.Tickets.summarize()`]);
bug('b1-incident', 'clear-all invalidation touches other companies', BM, [`entries.delete(keyOf(name, args));`, `entries.clear();`]);
alt('b1-incident', 'this-based statics are a valid fix', BT,
  [`const ticket = await models.Tickets.findOne({ _id });`, `const ticket = await (this as any).findOne({ _id });`],
  [`const ticket = await models.Tickets.findOneAndUpdate(`, `const ticket = await (this as any).findOneAndUpdate(`],
  [`models.Tickets.countDocuments({ status: 'open' })`, `(this as any).countDocuments({ status: 'open' })`],
  [`models.Tickets.countDocuments({ status: 'closed' })`, `(this as any).countDocuments({ status: 'closed' })`]);

addTaskforgeMutants({ bug, alt });

const cur = loadCurriculum();
const tasks = [...cur.byKey.values()].filter((i): i is TaskItem => i.kind !== 'lesson');
const only = process.argv[2];
const taskFor = (name: string) => tasks.find((x) => x.key.endsWith(name));
const list = only ? ms.filter((m) => m.task.includes(only) || taskFor(m.task)?.key.includes(only)) : ms;
const out: { task: string; name: string; verdict: string }[] = [];
let idx = 0;
let stale = 0;
async function worker() {
  while (idx < list.length) {
    const m = list[idx++];
    const t = taskFor(m.task);
    if (!t) { stale++; console.log('NO TASK', m.task); continue; }
    const base = taskSolution(cur, t);
    const files: Record<string, string> = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, String(v).replace(/\r\n/g, '\n')]));
    if (!(m.file in files)) { stale++; console.log('NO FILE', m.task, m.file, Object.keys(files).slice(0, 12)); continue; }
    let src = files[m.file];
    if (m.whole) src = m.whole;
    let applied = true;
    for (const [a, b] of m.edits ?? []) {
      if (!src.includes(a)) { applied = false; console.log('NOT APPLIED', m.task, m.name, JSON.stringify(a.slice(0, 50))); }
      src = src.split(a).join(b);
    }
    if (!applied) { stale++; continue; }
    files[m.file] = src;
    const r = await runJob({ mode: 'test', files, tests: t.tests, env: t.env, db: t.db });
    const failed = r.results.filter((x) => !x.passed).map((x) => x.name);
    const killed = !r.ok;
    const how = r.compileErrors ? 'compile: ' + r.compileErrors[0]?.text : r.crashed ? 'crash: ' + r.crashed.message.slice(0, 100) : failed.slice(0, 3).join(' | ');
    const verdict = m.alt ? (killed ? 'FALSE-REJECT' : 'alt-ok') : killed ? 'killed' : 'SURVIVED';
    out.push({ task: m.task, name: m.name, verdict });
    console.log(`${verdict.padEnd(13)} ${m.task.padEnd(20)} ${m.name}${killed ? '  <- ' + how : ''}`);
  }
}
await Promise.all([1, 2, 3, 4].map(worker));
const n = (v: string) => out.filter((o) => o.verdict === v).length;
console.log(`\nTOTAL ${out.length}: killed ${n('killed')}, SURVIVED ${n('SURVIVED')}, alt-ok ${n('alt-ok')}, FALSE-REJECT ${n('FALSE-REJECT')}, stale ${stale}`);
process.exit(n('SURVIVED') + n('FALSE-REJECT') + stale ? 1 : 0);
