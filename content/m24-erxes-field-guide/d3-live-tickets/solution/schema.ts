export const typeDefs = /* GraphQL */ `
  type Ticket {
    _id: ID!
    subject: String!
    priority: String!
  }
  type Query {
    ok: Boolean
  }
  type Subscription {
    ticketChanged(_id: ID!): Ticket
    ticketListChanged(priority: String): Ticket
  }
`;
