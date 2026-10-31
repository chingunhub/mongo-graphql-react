export const searchTypeDefs = /* GraphQL */ `
  union SearchResult = Project | Issue | User

  extend type Query {
    "Projects, then issues, then people matching the term (case-insensitive)."
    search(term: String!): [SearchResult!]!
  }
`;
