import { orderPlugins } from './packages/contracts/plugins';
console.log(
  orderPlugins([
    { name: 'tickets', version: 1, requires: ['contacts'] },
    { name: 'contacts', version: 1, requires: [] },
  ]),
);
