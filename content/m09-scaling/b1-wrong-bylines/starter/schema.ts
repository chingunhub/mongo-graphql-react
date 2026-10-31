export const typeDefs = /* GraphQL */ `
  type Author {
    id: ID!
    name: String!
  }

  type Article {
    id: ID!
    title: String!
    author: Author
    reviewers: [Author!]!
    commentCount: Int!
  }

  type Query {
    articles: [Article!]!
  }
`;
