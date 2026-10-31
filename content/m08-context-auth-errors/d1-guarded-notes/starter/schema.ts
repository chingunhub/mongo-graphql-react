export const typeDefs = /* GraphQL */ `
  type User {
    id: ID!
    name: String!
  }

  type Note {
    id: ID!
    title: String!
    body: String!
    shared: Boolean!
    owner: User!
    "ISO-8601"
    createdAt: String!
  }

  input NoteInput {
    title: String
    body: String
    shared: Boolean
  }

  type Query {
    "My notes, newest first. Requires login."
    myNotes: [Note!]!
    "A note that is shared or mine; otherwise null."
    note(id: ID!): Note
  }

  type Mutation {
    createNote(input: NoteInput!): Note!
    updateNote(id: ID!, input: NoteInput!): Note!
    deleteNote(id: ID!): ID!
  }
`;
