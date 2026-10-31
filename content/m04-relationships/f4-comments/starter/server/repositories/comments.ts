import { Comment } from '../models/Comment';
import { Issue } from '../models/Issue';

export async function addComment(issueId: string, authorId: string, body: string) {
  // TODO: null if the issue doesn't exist; otherwise create + populate author (name)
  return null;
}

export async function listComments(issueId: string) {
  // TODO: oldest first, author populated (name)
  return [];
}
