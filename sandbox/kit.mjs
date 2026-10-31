// Helpers for hidden tests. Imported by tests as '@forge/kit'.
// Kept as a single external module so it shares package instances (mongoose, react, apollo)
// with the learner's code.

import mongoose from 'mongoose';

// ---------- MongoDB ----------

/** Delete every document in every collection (keeps indexes). */
export async function resetDb() {
  const db = mongoose.connection.db;
  if (!db) return;
  const cols = await db.collections();
  await Promise.all(cols.map((c) => c.deleteMany({})));
}

/** Make sure a model's indexes exist (unique indexes are not validators — they live in MongoDB). */
export async function ensureIndexes(...models) {
  for (const m of models) await m.syncIndexes();
}

/**
 * Count the MongoDB operations a function performs.
 * Uses mongoose's debug hook, so it sees find/findOne/aggregate/insert/update etc.
 */
export async function countQueries(fn) {
  const ops = [];
  mongoose.set('debug', (collection, method, ...args) => {
    ops.push({ collection, method, filter: args[0] });
  });
  try {
    const result = await fn();
    return { result, count: ops.length, ops };
  } finally {
    mongoose.set('debug', false);
  }
}

/** Expect a promise to reject with a Mongo duplicate-key error. */
export async function isDuplicateKeyError(promise) {
  try {
    await promise;
    return false;
  } catch (err) {
    return err?.code === 11000 || /duplicate key/i.test(err?.message ?? '');
  }
}

// ---------- Apollo Server ----------

/**
 * Run an operation against an ApolloServer instance without HTTP.
 * Returns { data, errors } like a real response body.
 */
export async function execute(server, query, variables, contextValue = {}) {
  const res = await server.executeOperation({ query, variables }, { contextValue });
  if (res.body.kind !== 'single') throw new Error('Expected a single result');
  return res.body.singleResult;
}

export function errorCodes(result) {
  return (result.errors ?? []).map((e) => e.extensions?.code);
}

/** Plain HTTP GraphQL request (used when testing a real running server). */
export async function httpGraphQL(url, query, variables, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  return { status: res.status, body: await res.json() };
}

// ---------- Apollo Client + React ----------

/**
 * An ApolloClient backed by an in-process executable schema.
 * Records every operation the client sends, so tests can inspect variables.
 */
export async function createSchemaClient({ typeDefs, resolvers, cache }) {
  const { ApolloClient, InMemoryCache, ApolloLink } = await import('@apollo/client');
  const { SchemaLink } = await import('@apollo/client/link/schema');
  const { makeExecutableSchema } = await import('@graphql-tools/schema');
  const { print } = await import('graphql');

  const schema = makeExecutableSchema({ typeDefs, resolvers });
  const operations = [];
  const recorder = new ApolloLink((operation, forward) => {
    operations.push({
      name: operation.operationName,
      variables: operation.variables,
      query: print(operation.query),
    });
    return forward(operation);
  });
  const client = new ApolloClient({
    link: ApolloLink.from([recorder, new SchemaLink({ schema })]),
    cache: cache ?? new InMemoryCache(),
  });
  return { client, operations, schema };
}

export async function renderWithClient(ui, client) {
  const React = await import('react');
  const { render } = await import('@testing-library/react');
  const { ApolloProvider } = await import('@apollo/client/react');
  return render(React.createElement(ApolloProvider, { client }, ui));
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
