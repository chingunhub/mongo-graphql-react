import { Issue, type Status, type Priority } from '../models/Issue';

export interface IssueFilter {
  status?: Status;
  priority?: Priority;
  /** a user id, or null for "unassigned" */
  assigneeId?: string | null;
  label?: string;
  search?: string;
}

export type IssueSort = 'NEWEST' | 'OLDEST' | 'UPDATED';

export interface ListOptions {
  sort?: IssueSort;
  limit?: number;
  offset?: number;
}

export interface IssuePatch {
  title?: string;
  description?: string;
  status?: Status;
  priority?: Priority;
  assignee?: string | null;
}

export function buildIssueFilter(projectId: string, filter: IssueFilter = {}): Record<string, unknown> {
  // TODO
  return { project: projectId };
}

export async function listIssues(projectId: string, filter: IssueFilter = {}, options: ListOptions = {}) {
  // TODO
  return [];
}

export async function countIssues(projectId: string, filter: IssueFilter = {}) {
  // TODO
  return 0;
}

export async function updateIssue(id: string, patch: IssuePatch) {
  // TODO
  return null;
}

export async function addLabel(issueId: string, label: { name: string; color?: string }) {
  // TODO
  return null;
}

export async function removeLabel(issueId: string, name: string) {
  // TODO
  return null;
}
