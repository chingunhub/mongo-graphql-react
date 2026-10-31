export const typeDefs = /* GraphQL */ `
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])

  type Contact {
    _id: ID!
    name: String!
  }

  type Ticket @key(fields: "_id") {
    _id: ID!
    subject: String!
    priority: String!
    contactId: ID
    contact: Contact
  }

  type Query {
    tickets(priority: String): [Ticket!]!
    ticket(_id: ID!): Ticket!
  }

  type Mutation {
    ticketAdd(subject: String!, contactId: ID): Ticket!
    ticketRaise(_id: ID!): Ticket!
  }
`;
