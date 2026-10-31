import { buildContext, requireAction } from './packages/contracts/context';
const context = buildContext({ id: 'mia', memberships: { north: 'agent', south: 'reader' } }, 'north', 'request-1');
requireAction(context, 'tickets:triage');
console.log(context);
