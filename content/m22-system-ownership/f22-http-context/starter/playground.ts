import { resolveHttpContext } from './services/http-context';
console.log(
  resolveHttpContext(
    { authorization: 'Bearer demo', 'x-relay-tenant': 'north' },
    { demo: { id: 'ada', memberships: { north: 'agent' } } },
    () => 'request-1',
  ),
);
