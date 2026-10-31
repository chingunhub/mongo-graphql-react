import { requireAction, type Context } from '../packages/contracts/context';
import { Ticket } from './tickets/model';
import { Activity, openingEvent, type OpeningEvent } from './activity/worker';
export async function dispatchPending(ctx: Context, deliver: (event: OpeningEvent) => Promise<unknown>) {
  return { delivered: 0, failed: 0 };
}
export async function operationReport(ctx: Context) {
  return { tickets: 0, pending: 0, activities: 0 };
}
