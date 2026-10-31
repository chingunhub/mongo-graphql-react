export type Status = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Issue {
  id: string;
  title: string;
  status: Status;
  priority: Priority;
}

export type Board = Record<Status, Issue[]>;

export function toBoard(issues: Issue[]): Board {
  // TODO: build the four columns (in board order), then sort each column by priority.
  throw new Error('Not implemented yet');
}
