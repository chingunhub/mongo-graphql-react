export const typeDefs = /* GraphQL */ `
  type User {
    id: ID!
    name: String!
  }

  type Expense {
    id: ID!
    title: String!
    amountCents: Int!
  }

  type Query {
    me: User
    myExpenses: [Expense!]!
  }

  type Mutation {
    updateExpense(id: ID!, title: String!): Expense!
    deleteExpense(id: ID!): ID!
  }
`;
