import { randomUUID } from 'node:crypto';
import { loadCurriculum, stepSolution, type TaskItem } from '../server/content.js';
import { runJob } from '../server/runner.js';

const redisUrl = process.env.FORGE_REDIS ?? 'redis://127.0.0.1:6397';
const url = new URL(redisUrl);
if (url.protocol !== 'redis:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
  throw Error('This lab verifier requires a loopback Redis URL');
const prefix = 'forge-queue-verify-' + randomUUID();
const cur = loadCurriculum();
const task = cur.byKey.get('m22/f22-queue-transport') as TaskItem;
const tests = `
import { expect } from 'expect';
import { Queue,QueueEvents,Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { Activity,processOpening,enqueueOpening } from '../services/activity/worker';
import { Ticket } from '../services/tickets/model';
import { ingest } from '../services/tickets/intake';
import { dispatchPending,operationReport } from '../services/operations';
import { buildContext } from '../packages/contracts/context';
import { openQueueDelivery } from '../runtime/queue';
const connection=new Redis(${JSON.stringify(redisUrl)},{maxRetriesPerRequest:null,retryStrategy:()=>null,connectTimeout:2000});
connection.on('error',()=>{});
const prefix=${JSON.stringify(prefix)};
const queue=new Queue('opening',{connection,prefix});
const events=new QueueEvents('opening',{connection,prefix});
let worker:any;
let calls=0;
let failNext=true;
const event={version:1,id:'event-7',tenant:'north',ticketId:'ticket-7',type:'ticket.opened',requestId:'request-7'};
beforeAll(async()=>{
  await connection.ping();
  await Promise.all([queue.waitUntilReady(),events.waitUntilReady(),Activity.init(),Ticket.init()]);
});
afterAll(async()=>{
  await worker?.close();
  await events.close();
  // Only this verifier's UUID namespace is removed; never FLUSHDB or FLUSHALL.
  await queue.obliterate({force:true});
  await queue.close();
  connection.disconnect();
});
test('job waits while no worker is running',async()=>{
  const job=await enqueueOpening(queue,event);
  expect(await job.getState()).toBe('waiting');
  expect(await Activity.countDocuments()).toBe(0);
});
test('real worker retries a transient failure and commits the receipt',async()=>{
  worker=new Worker('opening',async job=>{
    calls++;
    if(failNext){failNext=false;throw Error('injected transient outage');}
    return processOpening(job.data);
  },{connection,prefix,concurrency:2});
  worker.on('error',()=>{});
  await worker.waitUntilReady();
  const job=await enqueueOpening(queue,event);
  const result=await job.waitUntilFinished(events,8000);
  expect(result.duplicate).toBe(false);
  expect(calls).toBe(2);
  expect(await Activity.countDocuments()).toBe(1);
  const stored=await queue.getJob(job.id!);
  expect(stored?.attemptsMade).toBe(2);
},{timeout:12000});
test('completed-job removal does not remove domain idempotency',async()=>{
  const job=await enqueueOpening(queue,event);
  await job.remove();
  const replay=await enqueueOpening(queue,event);
  const result=await replay.waitUntilFinished(events,8000);
  expect(result.duplicate).toBe(true);
  expect(await Activity.countDocuments()).toBe(1);
},{timeout:12000});
test('a malformed event exhausts a bounded retry budget with no effect',async()=>{
  const job=await queue.add('ticket.opened',{...event,version:99},{attempts:2,backoff:{type:'fixed',delay:20}});
  await expect(job.waitUntilFinished(events,8000)).rejects.toThrow();
  const failed=await queue.getJob(job.id!);
  expect(await failed?.getState()).toBe('failed');
  expect(failed?.attemptsMade).toBe(2);
  expect(await Activity.countDocuments()).toBe(1);
},{timeout:12000});
test('dispatcher acknowledges only after a real worker result',async()=>{
  const ctx=buildContext({id:'ada',memberships:{south:'agent'}},'south','queue-request');
  await ingest(ctx,{sourceId:'queue-intake',subject:'Queued ticket',contactId:'c1'});
  expect(await operationReport(ctx)).toEqual({tickets:1,pending:1,activities:0});
  expect(await dispatchPending(ctx,async event=>{
    const job=await enqueueOpening(queue,event);
    return job.waitUntilFinished(events,8000);
  })).toEqual({delivered:1,failed:0});
  expect(await operationReport(ctx)).toEqual({tickets:1,pending:0,activities:1});
},{timeout:12000});
test('learner-owned queue adapter runs real BullMQ delivery, replay and shutdown',async()=>{
  const adapterPrefix=prefix+'-adapter';
  const cleanupQueue=new Queue('opening',{connection,prefix:adapterPrefix});
  let delivery:Awaited<ReturnType<typeof openQueueDelivery>>|undefined;
  try{
    delivery=await openQueueDelivery(${JSON.stringify(redisUrl)},adapterPrefix);
    const input={...event,id:'adapter-event',tenant:'adapter-tenant'};
    expect(delivery.mode).toBe('BullMQ / Redis');
    expect((await delivery.deliver(input)).duplicate).toBe(false);
    const completed=await enqueueOpening(cleanupQueue,input);await completed.remove();
    expect((await delivery.deliver(input)).duplicate).toBe(true);
    expect(await Activity.countDocuments({tenant:input.tenant,eventId:input.id})).toBe(1);
    await Promise.all([delivery.close(),delivery.close()]);
    await expect(delivery.deliver({...input,id:'after-close'})).rejects.toThrow('CLOSED');
  }finally{
    await delivery?.close();
    await cleanupQueue.obliterate({force:true});await cleanupQueue.close();
  }
},{timeout:20000});

`;
const output = await runJob({
  mode: 'test',
  files: stepSolution(cur, task),
  tests: { 'task.test.ts': tests },
  env: 'node',
  db: true,
  timeoutMs: 45000,
});
for (const result of output.results)
  console.log(
    (result.passed ? 'PASS ' : 'FAIL ') + result.name + (result.message ? '\n' + result.message : ''),
  );
if (output.crashed || output.compileErrors)
  console.error(
    JSON.stringify(
      {
        crashed: output.crashed,
        compileErrors: output.compileErrors,
        logs: output.logs,
      },
      null,
      2,
    ),
  );
console.log(
  JSON.stringify({
    transport: 'real BullMQ over Redis-compatible TCP',
    redisUrl,
    prefix,
    passed: output.results.filter((r) => r.passed).length,
    total: output.results.length,
    ok: output.ok,
  }),
);
process.exit(output.ok ? 0 : 1);
