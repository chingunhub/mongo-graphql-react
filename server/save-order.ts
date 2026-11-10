/** A late unload beacon or HTTP request must not overwrite a newer revision from the same editor. */
export function createSaveOrder() {
  const revisions = new Map<string, number>();
  return (key: string, value: unknown, save: () => void) => {
    if (value === undefined) {
      save();
      return;
    } // Older clients and local tools remain compatible.
    const v = value as { editor?: unknown; revision?: unknown };
    if (
      !v ||
      typeof v.editor !== 'string' ||
      !/^[A-Za-z0-9-]{1,80}$/.test(v.editor) ||
      !Number.isSafeInteger(v.revision) ||
      Number(v.revision) < 1
    )
      throw new Error('Invalid save revision');
    const id = key + ':' + v.editor;
    if ((revisions.get(id) ?? 0) >= Number(v.revision)) return;
    save();
    revisions.delete(id);
    revisions.set(id, Number(v.revision));
    if (revisions.size > 1000) revisions.delete(revisions.keys().next().value!);
  };
}
