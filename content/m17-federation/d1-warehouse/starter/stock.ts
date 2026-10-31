import { buildSubgraphSchema } from '@apollo/subgraph';
import { parse } from 'graphql';
export type Stock = { warehouse: string; sku: string; quantity: number };
export function stockSchema(rows: Stock[]) {
  // TODO: declare Stock's compound entity key and resolve references.
  return buildSubgraphSchema([
    {
      typeDefs: parse('type Query { ping: String }'),
      resolvers: { Query: { ping: () => 'ok' } },
    },
  ]);
}
