import { generateModels } from './connectionResolvers';
import { buildSummary } from './modules/reports/summary';
import { checkSession } from './utils/auth';
import { clearMemo } from './utils/memo';

export async function login(subdomain: string, userId: string) {
  const models = await generateModels(subdomain);
  await models.Sessions.create({ userId });
}

export async function createTicket(subdomain: string, userId: string, subject: string) {
  const models = await generateModels(subdomain);
  await checkSession(models, userId);
  const ticket = await models.Tickets.create({ subject });
  clearMemo('summary', [subdomain]);
  return ticket;
}

export async function openTicket(subdomain: string, userId: string, _id: string) {
  const models = await generateModels(subdomain);
  await checkSession(models, userId);
  return models.Tickets.getTicket(_id);
}

export async function closeTicket(subdomain: string, userId: string, _id: string) {
  const models = await generateModels(subdomain);
  await checkSession(models, userId);
  const ticket = await models.Tickets.closeTicket(_id);
  clearMemo('summary', [subdomain]);
  return ticket;
}

export async function ticketSummary(subdomain: string, userId: string) {
  const models = await generateModels(subdomain);
  await checkSession(models, userId);
  return buildSummary(models, subdomain);
}
