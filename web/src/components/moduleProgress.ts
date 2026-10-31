import { stages } from '../../../shared/stages';
import type { ItemSummary, ModuleSummary } from '../api';

const NAMES: Record<ItemSummary['kind'], [string, string]> = {
  lesson: ['lesson', 'lessons'],
  drill: ['drill', 'drills'],
  bughunt: ['bug hunt', 'bug hunts'],
  forge: ['forge step', 'forge steps'],
};

export function isDone(item: ItemSummary) {
  return item.kind === 'lesson' ? !!item.done : item.status === 'passed';
}

/** Each stage with its count, and the item to open: the next one to do, or the first once it's finished. */
export function stageProgress(modules: ModuleSummary[]) {
  return stages.map((stage) => {
    const items = modules.filter((m) => m.stage === stage.number).flatMap((m) => m.items);
    const left = items.filter((item) => !isDone(item));
    const open = left.find((item) => !item.locked) ?? left[0] ?? items[0];
    return { stage, done: items.length - left.length, total: items.length, open };
  });
}

/** "1 forge step and 2 drills", in the order a module usually runs them. */
export function describeItems(items: ItemSummary[]) {
  const parts = (Object.keys(NAMES) as ItemSummary['kind'][]).flatMap((kind) => {
    const count = items.filter((item) => item.kind === kind).length;
    return count ? [count + ' ' + NAMES[kind][count === 1 ? 0 : 1]] : [];
  });
  return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts.at(-1) : (parts[0] ?? '');
}

/** What this item leaves in its module, so the end of a module is never a surprise. */
export function afterThis(modules: ModuleSummary[], mod: ModuleSummary, key: string) {
  const left = mod.items.filter((item) => item.key !== key && !isDone(item));
  if (left.length) return 'After this: ' + describeItems(left) + ' left in module ' + mod.number + '.';
  const next = modules[modules.indexOf(modules.find((m) => m.id === mod.id)!) + 1];
  return next
    ? 'Last one in this module. Next: module ' + next.number + ', ' + next.title + '.'
    : 'Last one in the course.';
}
