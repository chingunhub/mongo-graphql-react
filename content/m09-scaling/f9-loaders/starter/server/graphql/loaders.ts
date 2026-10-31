import DataLoader from 'dataloader';
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Project } from '../models/Project';
import { Comment } from '../models/Comment';

/** Fresh loaders for ONE request. Never share them across requests. */
export function createLoaders() {
  return {
    // TODO userById, projectById, commentCountByIssue, commentsByIssue
  } as any;
}

export type Loaders = ReturnType<typeof createLoaders>;
