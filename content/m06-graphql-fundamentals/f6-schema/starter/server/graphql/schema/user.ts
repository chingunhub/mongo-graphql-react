// Worked example: the user domain, finished. Read it before writing the others.
export const userTypeDefs = /* GraphQL */ `
  enum Role {
    MEMBER
    ADMIN
  }

  type User {
    id: ID!
    name: String!
    """
    Only visible to the user themselves and to admins; null for everyone else.
    """
    email: String
    role: Role!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  input SignUpInput {
    name: String!
    email: String!
    password: String!
  }

  extend type Query {
    "The logged-in user, or null when not logged in."
    me: User
    users: [User!]!
  }

  extend type Mutation {
    signUp(input: SignUpInput!): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
  }
`;
