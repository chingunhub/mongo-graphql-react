// Browsers don't let pages block Ctrl+W, but they do let a page ask "Leave site?" first.
// That turns an accidental Ctrl+W (meant to be Ctrl+S) into a harmless extra click.

let allowed = false;
const flushers = new Set<() => void>();

/** Let the next unload through without asking (deliberate reloads). */
export function allowUnload() {
  allowed = true;
}

/** Register a function that saves pending work synchronously-ish when the window closes. */
export function onUnloadFlush(fn: () => void) {
  flushers.add(fn);
  return () => void flushers.delete(fn);
}

export function installUnloadGuard() {
  window.addEventListener('beforeunload', (e) => {
    flushers.forEach((fn) => fn());
    if (allowed) return;
    e.preventDefault();
    e.returnValue = '';
  });
  // Ctrl+S anywhere: never the browser's "Save page as…" dialog. (The editor saves your code on Ctrl+S.)
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') e.preventDefault();
  });
}
