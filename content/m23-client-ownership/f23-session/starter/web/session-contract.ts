import type { ApolloClient } from '@apollo/client';
import type { OperationsApi } from './OperationsPanel';
export type IntakeInput = {
  sourceId: string;
  subject: string;
  contactId: string;
};
export type TriageInput = {
  ticketId: string;
  expectedVersion: number;
  priority: 'low' | 'normal' | 'high';
};
export interface InboxApi {
  accept(input: IntakeInput): Promise<{ id: string; subject: string; version: number }>;
  triage(input: TriageInput): Promise<unknown>;
}
export interface SessionOptions {
  baseUrl: string;
  headers: Readonly<Record<string, string>>;
  fetcher?: typeof fetch;
}
export interface RelaySession {
  client: ApolloClient;
  inbox: InboxApi;
  operations: OperationsApi;
  stop(): void;
}
