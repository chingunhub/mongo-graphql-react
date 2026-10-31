import type { IModels } from '../../connectionResolvers';
import { memo } from '../../utils/memo';

const ONE_MINUTE = 60_000;

export const buildSummary = (models: IModels, subdomain: string) =>
  memo('summary', [subdomain], ONE_MINUTE, () => models.Tickets.summarize());
