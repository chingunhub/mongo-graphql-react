export const commentTypeDefs = /* GraphQL */ `
  type Comment {
    id: ID!
    body: String!
    author: User!
    "ISO-8601"
    createdAt: String!
  }

  extend type Mutation {
    addComment(issueId: ID!, body: String!): Comment!
  }
`;
