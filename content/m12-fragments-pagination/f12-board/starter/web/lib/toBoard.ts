// Provided — and familiar: this is the warm-up from module 0, now used for real.
export type Status = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export const COLUMNS: { status: Status; label: string }[] = [
  { status: 'TODO', label: 'To do' },
  { status: 'IN_PROGRESS', label: 'In progress' },
  { status: 'IN_REVIEW', label: 'In review' },
  { status: 'DONE', label: 'Done' },
];

const RANK: Record<Priority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Group issues into the four columns, most urgent first; ties keep their original order. */
export function toBoard<T extends { status: Status; priority: Priority }>(issues: readonly T[]): Record<Status, T[]> {
  const board: Record<Status, T[]> = { TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] };
  for (const issue of issues) board[issue.status]?.push(issue);
  for (const column of Object.values(board)) column.sort((a, b) => RANK[a.priority] - RANK[b.priority]);
  return board;
}
