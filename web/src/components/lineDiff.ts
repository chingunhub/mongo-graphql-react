export interface DiffRow {
  kind: 'same' | 'mine' | 'reference' | 'gap';
  text: string;
}

const LIMIT = 4_000_000;

/** A line diff, with long unchanged stretches folded. Beyond LIMIT it shows both middles whole. */
export function lineDiff(mine: string, reference: string, context = 3): DiffRow[] {
  const a = mine.replace(/\r\n/g, '\n').split('\n');
  const b = reference.replace(/\r\n/g, '\n').split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length,
    endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const rows: DiffRow[] = a.slice(0, start).map((text) => ({ kind: 'same', text }));
  const x = a.slice(start, endA),
    y = b.slice(start, endB);
  if (x.length * y.length > LIMIT) {
    rows.push(...x.map((text) => ({ kind: 'mine' as const, text })));
    rows.push(...y.map((text) => ({ kind: 'reference' as const, text })));
  } else {
    const table = Array.from({ length: x.length + 1 }, () => new Uint32Array(y.length + 1));
    for (let i = x.length - 1; i >= 0; i--)
      for (let j = y.length - 1; j >= 0; j--)
        table[i][j] = x[i] === y[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    let i = 0,
      j = 0;
    while (i < x.length || j < y.length) {
      if (i < x.length && j < y.length && x[i] === y[j]) {
        rows.push({ kind: 'same', text: x[i] });
        i++;
        j++;
      } else if (j === y.length || (i < x.length && table[i + 1][j] >= table[i][j + 1]))
        rows.push({ kind: 'mine', text: x[i++] });
      else rows.push({ kind: 'reference', text: y[j++] });
    }
  }
  rows.push(...a.slice(endA).map((text) => ({ kind: 'same' as const, text })));
  return fold(rows, context);
}

function fold(rows: DiffRow[], context: number) {
  const keep = rows.map(() => false);
  rows.forEach((row, i) => {
    if (row.kind === 'same') return;
    for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k++) keep[k] = true;
  });
  const out: DiffRow[] = [];
  let skipped = 0;
  rows.forEach((row, i) => {
    if (keep[i]) {
      if (skipped) out.push({ kind: 'gap', text: skipped + ' unchanged lines' });
      skipped = 0;
      out.push(row);
    } else skipped++;
  });
  if (skipped && out.length) out.push({ kind: 'gap', text: skipped + ' unchanged lines' });
  return out;
}
