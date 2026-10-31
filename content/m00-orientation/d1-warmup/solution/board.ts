export type Status = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Issue {
  id: string;
  title: string;
  status: Status;
  priority: Priority;
}

export type Board = Record<Status, Issue[]>;

const RANK: Record<Priority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export function toBoard(issues: Issue[]): Board {
  const board: Board = { TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] };
  for (const issue of issues) board[issue.status].push(issue);
  for (const column of Object.values(board)) column.sort((a, b) => RANK[a.priority] - RANK[b.priority]);
  return board;
}
