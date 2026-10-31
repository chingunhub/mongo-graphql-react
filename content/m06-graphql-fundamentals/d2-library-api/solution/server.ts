import { ApolloServer } from '@apollo/server';
import { GraphQLError } from 'graphql';
import { authors, books, type BookRow, type AuthorRow } from './data';

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

  input AddBookInput {
    title: String!
    year: Int!
    genre: Genre!
    authorId: ID!
  }

  type Mutation {
    addBook(input: AddBookInput!): Book!
  }
`;

const byYear = (a: BookRow, b: BookRow) => a.year - b.year;

export const resolvers = {
  Query: {
    books: (_: unknown, { genre }: { genre?: BookRow['genre'] }) =>
      books.filter((b) => !genre || b.genre === genre).sort(byYear),
    book: (_: unknown, { id }: { id: string }) => books.find((b) => b.id === id) ?? null,
    authors: () => authors,
  },
  Mutation: {
    addBook: (_: unknown, { input }: { input: Omit<BookRow, 'id'> }) => {
      if (!authors.some((a) => a.id === input.authorId)) throw new GraphQLError('Unknown author');
      const book: BookRow = { id: `b${books.length + 1}-${Date.now().toString(36)}`, ...input };
      books.push(book);
      return book;
    },
  },
  Book: {
    // Stored as authorId; exposed as an Author object.
    author: (book: BookRow) => authors.find((a) => a.id === book.authorId),
  },
  Author: {
    books: (author: AuthorRow) => books.filter((b) => b.authorId === author.id).sort(byYear),
  },
};

export function createServer() {
  return new ApolloServer({ typeDefs, resolvers });
}
