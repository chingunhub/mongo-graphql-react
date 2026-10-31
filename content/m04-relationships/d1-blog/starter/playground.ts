import { Author } from './models/Author';
import { Post } from './models/Post';
import { getPost, getAuthorPage, latestPosts } from './repositories/blog';

const sam = await Author.create({ name: 'Sam', email: 'sam@blog.dev', avatar: 'sam.png' });
const posts = await Post.create([
  { title: 'Hello world', slug: 'hello', author: sam._id, published: true, publishedAt: new Date('2026-01-01') },
  { title: 'Draft ideas', slug: 'draft', author: sam._id },
  { title: 'Mongoose tips', slug: 'tips', author: sam._id, published: true, publishedAt: new Date('2026-03-01') },
]);

console.log(await getPost(String(posts[0]._id)));
console.log(JSON.stringify(await getAuthorPage(String(sam._id)), null, 2));
console.log(await latestPosts());
