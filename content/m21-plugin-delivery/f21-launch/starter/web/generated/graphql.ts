/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never;
    };
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
};

export type Contact = {
  __typename?: 'Contact';
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  tenant: Scalars['ID']['output'];
};

export type Query = {
  __typename?: 'Query';
  contact?: Maybe<Contact>;
  tickets: Array<Ticket>;
};

export type QueryContactArgs = {
  id: Scalars['ID']['input'];
};

export type Ticket = {
  __typename?: 'Ticket';
  contact?: Maybe<Contact>;
  id: Scalars['ID']['output'];
  priority: Scalars['String']['output'];
  subject: Scalars['String']['output'];
  tenant: Scalars['ID']['output'];
  version: Scalars['Int']['output'];
};

export type TicketsQueryVariables = Exact<{ [key: string]: never }>;

export type TicketsQuery = {
  tickets: Array<{
    id: string;
    tenant: string;
    subject: string;
    priority: string;
    version: number;
    contact: { id: string; tenant: string; name: string } | null;
  }>;
};
