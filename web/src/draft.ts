import type { Files } from './api';
export interface SaveVersion {
  editor: string;
  revision: number;
}
export interface DraftState {
  files: Files;
  saved: boolean;
  error: string | null;
}
interface Options {
  initial: Files;
  save(files: Files, version: SaveVersion): Promise<unknown>;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  key: string;
  delay?: number;
}

/** Serial saves acknowledge a particular revision. The latest draft survives a failed request or reload. */
export function createDraft(options: Options) {
  const { storage, key } = options;
  const editor = crypto.randomUUID();
  let files = { ...options.initial };
  let revision = 0,
    acknowledged = 0;
  let error: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | null = null;
  let disposed = false;
  const listeners = new Set<(state: DraftState) => void>();
  try {
    const recovered = JSON.parse(storage?.getItem(key) ?? 'null');
    if (recovered && typeof recovered === 'object' && !Array.isArray(recovered)) {
      for (const p of Object.keys(files)) if (typeof recovered[p] === 'string') files[p] = recovered[p];
      if (JSON.stringify(files) !== JSON.stringify(options.initial)) revision++;
    }
  } catch {
    /* A malformed local draft cannot replace the server's saved files. */
  }
  const state = (): DraftState => ({
    files,
    saved: revision === acknowledged,
    error,
  });
  const notify = () => listeners.forEach((listener) => listener(state()));
  const retain = () => {
    try {
      storage?.setItem(key, JSON.stringify(files));
    } catch {
      /* Server saves still work if browser storage is full. */
    }
  };
  const schedule = (delay = options.delay ?? 900) => {
    clearTimeout(timer);
    if (!disposed)
      timer = setTimeout(() => {
        void flush().catch(() => schedule(3000));
      }, delay);
  };
  async function flush(): Promise<void> {
    clearTimeout(timer);
    if (pending) {
      await pending;
      return flush();
    }
    if (acknowledged === revision) return;
    const saving = revision,
      snapshot = { ...files };
    pending = (async () => {
      await Promise.resolve(); // Also serialize a transport that throws synchronously.
      try {
        await options.save(snapshot, { editor, revision: saving });
        acknowledged = saving;
        error = null;
        if (revision === saving) {
          try {
            storage?.removeItem(key);
          } catch {
            /* harmless stale draft */
          }
        }
      } catch (e) {
        error = 'Not saved: ' + (e as Error).message;
        retain();
        throw e;
      } finally {
        pending = null;
        notify();
      }
    })();
    await pending;
    // Edits made during the request are a different revision, even before React renders again.
    if (acknowledged !== revision) return flush();
  }
  return {
    state,
    subscribe(listener: (state: DraftState) => void) {
      listeners.add(listener);
      listener(state());
      return () => {
        listeners.delete(listener);
      };
    },
    edit(next: Files) {
      if (JSON.stringify(next) === JSON.stringify(files)) return;
      files = { ...next };
      revision++;
      error = null;
      retain();
      notify();
      schedule();
    },
    flush,
    beacon(send: (files: Files, version: SaveVersion) => void) {
      if (acknowledged !== revision) {
        retain();
        send(files, { editor, revision });
      }
    },
    start() {
      if (acknowledged !== revision) schedule();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      listeners.clear();
    },
  };
}
