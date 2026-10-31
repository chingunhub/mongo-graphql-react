import { Comment } from '../models/Comment';
import { Issue } from '../models/Issue';

export async function addComment(issueId: string, authorId: string, body: string) {
  const exists = await Issue.exists({ _id: issueId });
  if (!exists) return null;
  const comment = await Comment.create({ issue: issueId, author: authorId, body });
  return comment.populate({ path: 'author', select: 'name' });
}

export async function listComments(issueId: string) {
  return Comment.find({ issue: issueId })
    .sort({ createdAt: 1, _id: 1 })
    .populate({ path: 'author', select: 'name' });
}
