export const typeDefs = /* GraphQL */ `
  type Post {
    id: ID!
    author: String!
    text: String!
    createdAt: String!
  }

  type PostEdge {
    cursor: String!
    node: Post!
  }

  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }

  type PostConnection {
    edges: [PostEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type Query {
    feed(first: Int = 10, after: String): PostConnection!
  }
`;
