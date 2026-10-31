import { buildSubgraphSchema } from '@apollo/subgraph';
import { parse } from 'graphql';
export type Stock = { warehouse: string; sku: string; quantity: number };
export function stockSchema(rows: Stock[]) {
  return buildSubgraphSchema([
    {
      typeDefs: parse(`extend schema @link(url:"https://specs.apollo.dev/federation/v2.3", import:["@key"])
      type Stock @key(fields:"warehouse sku") { warehouse: ID! sku: ID! quantity: Int! }
      type Query { ping: String }`),
      resolvers: {
        Query: { ping: () => 'ok' },
        Stock: {
          __resolveReference(ref: { warehouse: string; sku: string }, ctx: { warehouse: string }) {
            if (ref.warehouse !== ctx.warehouse) return null;
            return rows.find((row) => row.warehouse === ctx.warehouse && row.sku === ref.sku) ?? null;
          },
        },
      },
    },
  ]);
}
