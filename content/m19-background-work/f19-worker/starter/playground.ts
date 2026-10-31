import { Activity, processOpening } from './services/activity/worker';
await Activity.init();
const event = {
  version: 1,
  id: 'e1',
  tenant: 'north',
  ticketId: 't1',
  type: 'ticket.opened',
  requestId: 'r1',
};
console.log(await Promise.all([processOpening(event), processOpening(event)]));
console.log(await Activity.find().lean());
