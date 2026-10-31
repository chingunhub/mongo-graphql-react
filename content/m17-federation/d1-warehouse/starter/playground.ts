import { graphql } from 'graphql';
import { stockSchema } from './stock';
console.log(
  await graphql({
    schema: stockSchema([{ warehouse: 'n', sku: '7', quantity: 3 }]),
    source: '{ _entities(representations:[{__typename:"Stock",warehouse:"n",sku:"7"}]) { ... on Stock { quantity } } }',
    contextValue: { warehouse: 'n' },
  }),
);
