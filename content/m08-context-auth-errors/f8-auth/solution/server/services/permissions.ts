import mongoose from 'mongoose';
import { Project } from '../models/Project';
import { notFound, forbidden } from '../graphql/errors';

// The ONE place that decides who may change a project's data.
// (It throws GraphQL errors — a pragmatic shortcut; module 9 talks about the trade-off.)

const same = (a: unknown, b: unknown) => String((a as any)?._id ?? a) === String((b as any)?._id ?? b);

/** Admins, the owner and members may write to a project. */
export function canWriteProject(user: any, project: any): boolean {
  if (!user || !project) return false;
  return (
    user.role === 'ADMIN' ||
    same(project.owner, user._id) ||
    (project.members ?? []).some((m: unknown) => same(m, user._id))
  );
}

/** Load the project; NOT_FOUND if it doesn't exist, FORBIDDEN if the user may not write to it. */
export async function assertCanWriteProject(user: any, projectId: unknown) {
  const id = (projectId as any)?._id ?? projectId;
  const project = mongoose.isValidObjectId(id) ? await Project.findById(id) : null;
  if (!project) throw notFound('Project');
  if (!canWriteProject(user, project)) throw forbidden('Only project members can do that');
  return project;
}
