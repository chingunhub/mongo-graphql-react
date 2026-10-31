import { userResolvers } from './user';
import { projectResolvers } from './project';
import { issueResolvers } from './issue';
import { commentResolvers } from './comment';

// Apollo Server merges an array of resolver maps.
export const resolvers = [userResolvers, projectResolvers, issueResolvers, commentResolvers];
