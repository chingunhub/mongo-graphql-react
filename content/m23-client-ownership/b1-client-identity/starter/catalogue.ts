import { gql } from '@apollo/client';
export const BOOK = gql`
  query Book {
    book {
      __typename
      library
      id
      title
    }
  }
`;
