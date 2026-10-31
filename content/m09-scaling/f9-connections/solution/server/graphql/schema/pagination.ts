export const paginationTypeDefs = /* GraphQL */ `
  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }

  type IssueEdge {
    cursor: String!
    node: Issue!
  }

  type IssueConnection {
    edges: [IssueEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  # Added next to Project.issues rather than replacing it: existing clients keep working.
  extend type Project {
    issueConnection(filter: IssueFilter, first: Int = 20, after: String): IssueConnection!
  }
`;
