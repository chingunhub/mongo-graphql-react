import { bookingLoader } from './loader';
const loader = bookingLoader('north', async (tenant) => [
  { id: '2', tenant, title: 'Room B' },
  { id: '1', tenant, title: 'Room A' },
]);
console.log(await loader.loadMany(['1', 'missing', '2']));
