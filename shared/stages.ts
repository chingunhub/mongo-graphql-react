/** The course's three stages. Modules say which one they're in, in their module.json. */
export interface Stage {
  number: 1 | 2 | 3;
  name: string;
}

export const stages: Stage[] = [
  { number: 1, name: 'Backend' },
  { number: 2, name: 'Full stack' },
  { number: 3, name: 'Real systems' },
];

export interface Milestone {
  id: string;
  title: string;
  body: string;
  /** Where the student can see what they built. */
  link: { href: string; label: string };
}

/** Passing one of these items for the first time shows its screen. Forge steps run in order, so the ones before it passed too. */
export const milestones: Record<string, Milestone> = {
  'm09/f9-connections': {
    id: 'backend',
    title: 'Your backend is finished',
    body: 'You designed the data, wrote the resolvers, added auth and made it fast. That is a real GraphQL API, and you built every layer of it. This was the goal of Stage 1, so you can stop here and call it finished, or keep going.',
    link: { href: '/taskforge', label: 'Open your project' },
  },
  'm13/f13-due-dates': {
    id: 'full-stack',
    title: 'You built the whole app',
    body: 'You built it from the database to the screen, then carried one feature through every layer. When something breaks in this app, you know where to look, because you wrote it. This was the goal of Stage 2.',
    link: { href: '/taskforge', label: 'Open your project' },
  },
};
