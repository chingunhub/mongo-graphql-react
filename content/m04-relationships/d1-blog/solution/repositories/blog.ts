import { Author } from '../models/Author';
import { Post } from '../models/Post';

export async function getPost(id: string) {
  return Post.findById(id).populate({ path: 'author', select: 'name avatar' });
}

export async function getAuthorPage(authorId: string) {
  return Author.findById(authorId)
    .populate({ path: 'posts', select: 'title slug publishedAt' })
    .populate('publishedCount');
}

export async function latestPosts(limit = 5) {
  return Post.find({ published: true })
    .sort({ publishedAt: -1, _id: -1 })
    .limit(limit)
    .populate({ path: 'author', select: 'name' })
    .lean();
}
