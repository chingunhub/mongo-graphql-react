import { ApolloServer } from '@apollo/server';
import { GraphQLError } from 'graphql';
import { authors, books } from './data';

export const typeDefs = /* GraphQL */ `
  enum Genre {
    FICTION
    SCIFI
    FANTASY
    HISTORY
  }

  type Author {
    id: ID!
    name: String!
    born: Int
    books: [Book!]!
  }

  type Book {
    id: ID!
    title: String!
    year: Int!
    genre: Genre!
    author: Author!
  }

  type Query {
    books(genre: Genre): [Book!]!
    book(id: ID!): Book
    authors: [Author!]!
  }

  # TODO: input AddBookInput { … }
  # TODO: type Mutation { addBook(input: AddBookInput!): Book! }
`;

export const resolvers = {
  Query: {
    // TODO
  },
  // TODO: Mutation, Book, Author
};

export function createServer() {
  // TODO
  return null as unknown as ApolloServer;
}
