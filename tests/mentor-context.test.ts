import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Turn, Connection } from '../server/mentor/providers/types';

// Import all data-owning modules only after isolating the profile. Never load a real API key.
const directory = mkdtempSync(join(tmpdir(), 'forge-mentor-test-'));
process.env.FORGE_DATA = directory;
delete process.env.FORGE_MENTOR_OPENAI_KEY;
delete process.env.FORGE_MENTOR_ANTHROPIC_KEY;
const { mountMentor } = await import('../server/mentor/routes');
const { openaiProvider } = await import('../server/mentor/providers/openai');
const { emitActivity } = await import('../server/mentor/activity');
const { loadCurriculum, taskStart } = await import('../server/content');
const { flush } = await import('../server/progress');
const { loadThread, writeThread } = await import('../server/mentor/threads');
const cur = loadCurriculum();
const a = cur.byKey.get('m01/f1-user-model')!,
  b = cur.byKey.get('m02/f2-projects-issues')!;
const turns: Turn[] = [],
  sent: any[] = [],
  configs: any[] = [];
class Sideband extends EventEmitter {
  send(event: unknown) {
    sent.push(event);
  }
  close() {}
}
let sideband = new Sideband(),
  calls = 0;
const fake: Connection = {
  async listModels() {
    return ['test-model'];
  },
  conversation(model) {
    return {
      model,
      addTurn(turn) {
        turns.push(turn);
      },
      async round(sink) {
        sink.text('Look at the current item.');
        return { calls: [], usage: { cost: 0 } };
      },
      addToolResults() {},
      size: () => 100,
      save: () => ({ fake: true }),
    };
  },
  voice: {
    async create(config) {
      configs.push(config);
      return {
        session: { id: 'call-' + ++calls },
        transport: { type: 'webrtc', sdp: 'v=0\r\n' },
      } as any;
    },
    attach() {
      sideband = new Sideband();
      return sideband as any;
    },
    async hangup() {},
    async look() {
      return {} as any;
    },
    async speech() {
      return Buffer.alloc(0);
    },
  },
};
openaiProvider.connect = () => fake;
const app = express();
app.use(express.json());
mountMentor(app, {
  curriculum: () => cur,
  taskFiles: (task) => taskStart(cur, task),
  readonlyPaths: (task) => task.readonly,
});
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((r) => server.once('listening', r));
const origin = 'http://127.0.0.1:' + (server.address() as any).port;
const post = async (path: string, body: unknown) => {
  const response = await fetch(origin + '/api/mentor/' + path, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  assert.equal(response.status, 200, text);
  return text;
};
const chat = (key: string) =>
  post('chat', {
    itemKey: key,
    message: 'Where should I look?',
    provider: 'openai',
    model: 'test-model',
    effort: 'medium',
  });
const event = (type: string, rest: Record<string, unknown> = {}) => sideband.emit('event', { type, ...rest });
test.after(async () => {
  event('session.closed');
  flush();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(directory, { recursive: true, force: true });
});

test('voice navigation refreshes full backend context even when both tasks have the same tool set', async () => {
  await post('key', {
    provider: 'openai',
    key: 'test-only-key',
    remember: false,
  });
  await chat(a.key);
  await post('voice/session', {
    itemKey: a.key,
    sdp: 'v=0\r\n',
    nudges: false,
  });
  assert.match(configs[0].session.delegation.responses.instructions, new RegExp(a.key));
  sent.length = 0;
  emitActivity({ type: 'open', item: b });
  const update = sent.find((e) => e.type === 'session.update');
  assert.ok(update?.session.delegation.responses.instructions.includes(b.key));
  assert.ok(
    sent.some(
      (e) => e.type === 'response.item.create' && e.item.role === 'developer' && e.item.content.includes(b.key),
    ),
  );
});
test('voice-to-text handoff supplies the new project step, then keeps it across subsequent messages', async () => {
  event('session.input_transcript.delta', {
    delta: 'Tell me about this new step.',
    start_ms: 0,
    end_ms: 100,
  });
  event('session.output_transcript.delta', {
    delta: 'Let us examine the new model.',
    start_ms: 120,
    end_ms: 200,
  });
  event('session.closed');
  assert.equal(loadThread('openai', 'project-taskforge')?.contextItem, a.key);
  assert.equal(loadThread('openai', 'project-taskforge')?.lastItem, b.key);
  await chat(b.key);
  assert.ok(turns.at(-1)?.context?.includes(b.key));
  assert.match(turns.at(-1)?.note ?? '', /talked with you by voice/);
  await chat(b.key);
  assert.equal(turns.at(-1)?.context, undefined);
  assert.equal(loadThread('openai', 'project-taskforge')?.contextItem, b.key);
});
test('a saved pre-fix thread with an unknown model cursor refreshes context on restore', async () => {
  const task = [...cur.byKey.values()].find((i) => i.kind === 'drill')!;
  writeThread({
    provider: 'openai',
    scope: task.key,
    model: 'test-model',
    display: [],
    lastNote: '',
    lastItem: task.key,
    state: { fake: true },
  });
  await chat(task.key);
  assert.ok(turns.at(-1)?.context?.includes(task.key));
});
test('navigation during a backend response queues replacement context and rejects stale tools', async () => {
  await post('voice/session', {
    itemKey: a.key,
    sdp: 'v=0\r\n',
    nudges: false,
  });
  event('session.delegation.created', { delegation: { id: 'old-response' } });
  event('response.event', {
    delegation_id: 'old-response',
    event: { type: 'response.created' },
  });
  sent.length = 0;
  emitActivity({ type: 'open', item: b });
  assert.ok(
    sent.some((e) => e.type === 'session.update' && e.session.delegation.responses.instructions.includes(b.key)),
  );
  assert.ok(!sent.some((e) => e.type === 'response.item.create'));
  event('response.event', {
    delegation_id: 'old-response',
    event: {
      type: 'response.output_item.done',
      item: {
        type: 'function_call',
        call_id: 'stale-tool',
        name: 'show_code',
        arguments: JSON.stringify({ code: 'OLD_CONTEXT_SHOULD_NOT_RENDER' }),
      },
    },
  });
  event('response.event', {
    delegation_id: 'old-response',
    event: { type: 'response.completed', response: {} },
  });
  await new Promise((r) => setImmediate(r));
  const contextIndex = sent.findIndex(
    (e) => e.type === 'response.item.create' && e.item.role === 'developer' && e.item.content.includes(b.key),
  );
  const continuation = sent.findIndex((e) => e.type === 'response.create');
  assert.ok(contextIndex >= 0 && contextIndex < continuation);
  assert.ok(sent.some((e) => e.item?.call_id === 'stale-tool' && e.item.output.includes('previous item')));
  event('session.closed');
});
