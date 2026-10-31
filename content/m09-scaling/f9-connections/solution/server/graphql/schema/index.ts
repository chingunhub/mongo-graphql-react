import { baseTypeDefs } from './base';
import { userTypeDefs } from './user';
import { projectTypeDefs } from './project';
import { issueTypeDefs } from './issue';
import { commentTypeDefs } from './comment';
import { paginationTypeDefs } from './pagination';
import { searchTypeDefs } from './search';

// Apollo Server merges an array of typeDefs into one schema.
export const typeDefs = [
  baseTypeDefs,
  userTypeDefs,
  projectTypeDefs,
  issueTypeDefs,
  commentTypeDefs,
  paginationTypeDefs,
  searchTypeDefs,
];
