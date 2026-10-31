export const projectTypeDefs = /* GraphQL */ `
  type Project {
    id: ID!
    key: String!
    name: String!
    description: String!
    owner: User!
    members: [User!]!
    issues(filter: IssueFilter, sort: IssueSort = NEWEST, limit: Int = 20, offset: Int = 0): [Issue!]!
    issueCount(filter: IssueFilter): Int!
    stats: ProjectStats!
  }

  type ProjectStats {
    total: Int!
    byStatus: [StatusCount!]!
    workload: [Workload!]!
  }

  type StatusCount {
    status: IssueStatus!
    count: Int!
  }

  type Workload {
    user: User!
    open: Int!
  }

  input CreateProjectInput {
    key: String!
    name: String!
    description: String
  }

  extend type Query {
    projects: [Project!]!
    project(key: String!): Project
  }

  extend type Mutation {
    createProject(input: CreateProjectInput!): Project!
    addMember(projectId: ID!, userId: ID!): Project!
  }
`;
