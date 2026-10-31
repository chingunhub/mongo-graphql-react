import { currentModels } from '../../connectionResolvers';
import { memo } from '../../utils/memo';

const ONE_MINUTE = 60_000;

export const buildSummary = () =>
  memo('summary', [], ONE_MINUTE, () => currentModels().Tickets.summarize());
