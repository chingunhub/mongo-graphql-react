import { gql } from '@apollo/client';
export const TICKETS = gql`
  query Tickets {
    tickets {
      id
      tenant
      subject
      priority
      version
      contact {
        id
        tenant
        name
      }
    }
  }
`;
