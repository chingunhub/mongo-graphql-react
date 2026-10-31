export const typeDefs = /* GraphQL */ `
  type Artist {
    id: ID!
    name: String!
    albums: [Album!]!
  }

  type Album {
    id: ID!
    title: String!
    year: Int!
    artist: Artist!
    trackCount: Int!
  }

  type Query {
    albums: [Album!]!
    artists: [Artist!]!
  }
`;
