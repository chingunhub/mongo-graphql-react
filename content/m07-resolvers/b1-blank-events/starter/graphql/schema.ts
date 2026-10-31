export const typeDefs = /* GraphQL */ `
  type Venue {
    id: ID!
    name: String!
    city: String!
  }

  type Event {
    id: ID!
    title: String!
    startsAt: String!
    venue: Venue!
  }

  type Query {
    events: [Event!]!
    event(id: ID!): Event
  }

  type Mutation {
    renameEvent(id: ID!, title: String!): Event!
  }
`;
