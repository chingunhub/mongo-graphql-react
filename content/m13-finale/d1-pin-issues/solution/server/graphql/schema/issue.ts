export const issueTypeDefs = /* GraphQL */ `
  enum IssueStatus {
    TODO
    IN_PROGRESS
    IN_REVIEW
    DONE
  }

  enum Priority {
    LOW
    MEDIUM
    HIGH
    URGENT
  }

  enum IssueSort {
    NEWEST
    OLDEST
    UPDATED
  }

  type Label {
    name: String!
    color: String!
  }

  type Issue {
    id: ID!
    number: Int!
    "Human-readable key like TF-12."
    key: String!
    title: String!
    description: String!
    status: IssueStatus!
    priority: Priority!
    labels: [Label!]!
    project: Project!
    reporter: User!
    assignee: User
    comments: [Comment!]!
    commentCount: Int!
    "ISO-8601"
    createdAt: String!
    "ISO-8601"
    updatedAt: String!
    "A calendar date like 2026-10-31, or null."
    dueDate: String
    "Due before today (UTC) and not done."
    isOverdue: Boolean!
    "Pinned issues stay at the top of their column."
    pinned: Boolean!
  }

  input IssueFilter {
    status: IssueStatus
    priority: Priority
    "An explicit null means: unassigned issues."
    assigneeId: ID
    label: String
    search: String
    overdue: Boolean
  }

  input LabelInput {
    name: String!
    color: String
  }

  input CreateIssueInput {
    projectId: ID!
    title: String!
    description: String
    priority: Priority
    assigneeId: ID
    labels: [LabelInput!]
    "A calendar date like 2026-10-31."
    dueDate: String
  }

  input UpdateIssueInput {
    title: String
    description: String
    status: IssueStatus
    priority: Priority
    assigneeId: ID
    "A calendar date like 2026-10-31; null clears it."
    dueDate: String
  }

  extend type Query {
    issue(id: ID!): Issue
  }

  extend type Mutation {
    createIssue(input: CreateIssueInput!): Issue!
    updateIssue(id: ID!, input: UpdateIssueInput!): Issue!
    deleteIssue(id: ID!): ID!
    addLabel(issueId: ID!, label: LabelInput!): Issue!
    removeLabel(issueId: ID!, name: String!): Issue!
    setIssuePinned(id: ID!, pinned: Boolean!): Issue!
  }
`;
