import mongoose from 'mongoose';
import { Issue } from '../../models/Issue';
import { Project } from '../../models/Project';
import { User } from '../../models/User';
import { Comment } from '../../models/Comment';
import { updateIssue, addLabel, removeLabel } from '../../repositories/issues';
import { listComments } from '../../repositories/comments';
import { idOf, toISO, notFound } from './util';
import type { Context } from './types';

export const issueResolvers = {
  Query: {
    // TODO issue(id)
  },
  Mutation: {
    // TODO createIssue, updateIssue, deleteIssue, addLabel, removeLabel
  },
  Issue: {
    // TODO id, key, project, reporter, assignee, comments, commentCount, createdAt, updatedAt
  },
};
