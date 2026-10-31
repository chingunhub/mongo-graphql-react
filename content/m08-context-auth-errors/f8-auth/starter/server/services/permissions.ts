import mongoose from 'mongoose';
import { Project } from '../models/Project';

// The ONE place that decides who may change a project's data.
// (It throws GraphQL errors — a pragmatic shortcut; module 9 talks about the trade-off.)

/** Admins, the owner and members may write to a project. */
export function canWriteProject(user: any, project: any): boolean {
  // TODO
  return false;
}

/** Load the project; NOT_FOUND if it doesn't exist, FORBIDDEN if the user may not write to it. */
export async function assertCanWriteProject(user: any, projectId: unknown) {
  // TODO
}
