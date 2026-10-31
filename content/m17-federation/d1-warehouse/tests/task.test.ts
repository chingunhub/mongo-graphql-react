import { expect } from 'expect';
import { graphql } from 'graphql';
import { stockSchema } from '../stock';
const rows = [
  { warehouse: 'n', sku: '7', quantity: 3 },
  { warehouse: 's', sku: '7', quantity: 99 },
];
const query = 'query($refs:[_Any!]!) { _entities(representations:$refs) { ... on Stock { warehouse sku quantity } } }';
test('real _entities resolves a compound identity', async () => {
  const r = await graphql({
    schema: stockSchema(rows),
    source: query,
    variableValues: {
      refs: [{ __typename: 'Stock', warehouse: 'n', sku: '7' }],
    },
    contextValue: { warehouse: 'n' },
  });
  expect(r.errors).toBeUndefined();
  expect(JSON.parse(JSON.stringify(r.data))).toEqual({ _entities: [rows[0]] });
});
test(
  'foreign and missing entities are null in their original slots',
  async () => {
    const r = await graphql({
      schema: stockSchema(rows),
      source: query,
      variableValues: {
        refs: [
          { __typename: 'Stock', warehouse: 's', sku: '7' },
          { __typename: 'Stock', warehouse: 'n', sku: 'x' },
          { __typename: 'Stock', warehouse: 'n', sku: '7' },
        ],
      },
      contextValue: { warehouse: 'n' },
    });
    expect(r.errors).toBeUndefined();
    expect(JSON.parse(JSON.stringify(r.data))).toEqual({
      _entities: [null, null, rows[0]],
    });
  },
  {
    hint: 'A compound key identifies a record; trusted context decides whether it is visible.',
  },
);
test('subgraph advertises its actual key', async () => {
  const r = await graphql({
    schema: stockSchema(rows),
    source: '{ _service { sdl } ping }',
  });
  expect((r.data as any)._service.sdl).toContain('warehouse sku');
  expect(r.data?.ping).toBe('ok');
});
