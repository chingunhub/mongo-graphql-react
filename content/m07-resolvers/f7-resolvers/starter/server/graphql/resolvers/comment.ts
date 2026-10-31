import mongoose from 'mongoose';
import { User } from '../../models/User';
import { addComment } from '../../repositories/comments';
import { idOf, toISO, notFound } from './util';
import type { Context } from './types';

export const commentResolvers = {
  Mutation: {
    // TODO addComment(issueId, body)
  },
  Comment: {
    // TODO id, author, createdAt
  },
};
