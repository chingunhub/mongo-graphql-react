import { fork, type ChildProcess } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Request, Response } from 'express';
import { ROOT, MONGO_BASE, IS_WORKTREE, databaseName } from './paths.js';
import { bundleNode, writeTree, type Files } from './runner.js';

type Kind = 'mine' | 'reference';
type Status = 'stopped' | 'starting' | 'running' | 'crashed';
type Service = {
  status: Status;
  port: number;
  proc: ChildProcess | null;
  logs: string[];
};
const services: Record<Kind, Service> = {
  reference: {
    status: 'stopped',
    port: IS_WORKTREE ? 4820 : 4810,
    proc: null,
    logs: [],
  },
  mine: {
    status: 'stopped',
    port: IS_WORKTREE ? 4821 : 4811,
    proc: null,
    logs: [],
  },
};
export function relaydeskInfo(kind: Kind) {
  const { status, port, logs } = services[kind];
  return {
    status,
    port,
    log: logs.slice(-50),
    url: '/projects/relaydesk/' + kind + '/',
  };
}
export async function stopRelaydesk(kind: Kind) {
  const service = services[kind],
    proc = service.proc;
  if (!proc) return;
  service.proc = null;
  service.status = 'stopped';
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      proc.kill();
      resolve();
    }, 5000);
    proc.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    if (proc.connected) proc.send('shutdown');
    else proc.kill();
  });
}
export async function stopRelaydesks() {
  await Promise.all([stopRelaydesk('mine'), stopRelaydesk('reference')]);
}
export async function startRelaydeskPreview(kind: Kind, files: Files, redis: boolean) {
  const service = services[kind];
  if (service.status === 'starting') throw Error('Relaydesk is already starting');
  await stopRelaydesk(kind);
  service.status = 'starting';
  service.logs = [];
  const dir = join(ROOT, '.runs', 'relaydesk-' + kind);
  // Constant child of this checkout; never a user-supplied path.
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  let bundle: string;
  try {
    await writeTree(dir, files);
    bundle = await bundleNode(dir, 'runtime/cli.ts', 'relaydesk');
  } catch (error) {
    service.status = 'crashed';
    service.logs.push((error as Error).message);
    return relaydeskInfo(kind);
  }
  const proc = fork(bundle, [], {
    cwd: dir,
    execArgv: ['--enable-source-maps'],
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: {
      ...process.env,
      RELAYDESK_PORT: String(service.port),
      RELAYDESK_MONGO: MONGO_BASE + '/' + databaseName('forge_relaydesk_' + kind),
      RELAYDESK_REDIS: redis ? (process.env.FORGE_REDIS ?? 'redis://127.0.0.1:6397') : '',
      RELAYDESK_QUEUE_PREFIX: databaseName('relaydesk_' + kind),
      RELAYDESK_RESET: '',
    },
  });
  service.proc = proc;
  const push = (data: Buffer) => {
    for (const line of String(data).split(/\r?\n/)) if (line.trim()) service.logs.push(line);
    if (service.logs.length > 100) service.logs.splice(0, service.logs.length - 100);
  };
  proc.stdout?.on('data', push);
  proc.stderr?.on('data', push);
  proc.on('exit', () => {
    if (service.proc === proc) {
      service.proc = null;
      service.status = 'crashed';
    }
  });
  proc.on('error', (error) => {
    service.logs.push(error.message);
    service.status = 'crashed';
  });
  const until = Date.now() + 25000;
  while (Date.now() < until && service.proc === proc && service.status === 'starting') {
    if (service.logs.some((line) => line.includes('[relaydesk] ready '))) {
      service.status = 'running';
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (service.status === 'starting') {
    service.logs.push('Startup did not become ready within 25 seconds.');
    await stopRelaydesk(kind);
    service.status = 'crashed';
  }
  return relaydeskInfo(kind);
}
export async function proxyRelaydesk(kind: Kind, req: Request, res: Response) {
  const service = services[kind];
  if (service.status !== 'running')
    return void res.status(503).send('Start this Relaydesk workspace from the project page.');
  const headers: Record<string, string> = {};
  for (const key of ['content-type', 'authorization', 'x-relay-tenant', 'x-request-id']) {
    const value = req.get(key);
    if (value) headers[key] = value;
  }
  try {
    const response = await fetch('http://127.0.0.1:' + service.port + req.url, {
      method: req.method,
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
    });
    res.status(response.status);
    const contentType = response.headers.get('content-type');
    if (contentType) res.set('content-type', contentType);
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.status(502).json({ error: 'Relaydesk request failed: ' + (error as Error).message });
  }
}
