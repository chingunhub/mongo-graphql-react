// Mission Control — a small in-memory GraphQL API. Read the SDL; the resolvers are below it.
import { makeExecutableSchema } from '@graphql-tools/schema';

export const typeDefs = /* GraphQL */ `
  enum MissionStatus {
    PLANNED
    ACTIVE
    COMPLETE
  }

  enum Role {
    COMMANDER
    PILOT
    ENGINEER
    SCIENTIST
  }

  type Astronaut {
    id: ID!
    name: String!
    role: Role!
    nationality: String!
    missions: [Mission!]!
  }

  type Rocket {
    id: ID!
    name: String!
    reusable: Boolean!
  }

  type Mission {
    id: ID!
    name: String!
    launchYear: Int
    status: MissionStatus!
    rocket: Rocket!
    commander: Astronaut
    crew: [Astronaut!]!
  }

  input AddAstronautInput {
    name: String!
    role: Role!
    nationality: String!
  }

  type Query {
    missions(status: MissionStatus): [Mission!]!
    mission(id: ID!): Mission
    astronauts: [Astronaut!]!
  }

  type Mutation {
    addAstronaut(input: AddAstronautInput!): Astronaut!
  }
`;

const rockets = [
  { id: 'r1', name: 'Saturn V', reusable: false },
  { id: 'r2', name: 'Falcon 9', reusable: true },
  { id: 'r3', name: 'SLS', reusable: false },
];

const astronauts = [
  { id: 'a1', name: 'Neil Armstrong', role: 'COMMANDER', nationality: 'US' },
  { id: 'a2', name: 'Buzz Aldrin', role: 'PILOT', nationality: 'US' },
  { id: 'a3', name: 'Reid Wiseman', role: 'COMMANDER', nationality: 'US' },
  { id: 'a4', name: 'Jeremy Hansen', role: 'SCIENTIST', nationality: 'CA' },
  { id: 'a5', name: 'Christina Koch', role: 'ENGINEER', nationality: 'US' },
  { id: 'a6', name: 'Bob Behnken', role: 'COMMANDER', nationality: 'US' },
  { id: 'a7', name: 'Doug Hurley', role: 'PILOT', nationality: 'US' },
];

const missions = [
  { id: 'm1', name: 'Apollo 11', launchYear: 1969, status: 'COMPLETE', rocket: 'r1', commander: 'a1', crew: ['a1', 'a2'] },
  { id: 'm2', name: 'Artemis II', launchYear: 2026, status: 'ACTIVE', rocket: 'r3', commander: 'a3', crew: ['a3', 'a4', 'a5'] },
  { id: 'm3', name: 'Demo-2', launchYear: 2020, status: 'COMPLETE', rocket: 'r2', commander: 'a6', crew: ['a6', 'a7'] },
  { id: 'm4', name: 'Artemis III', launchYear: null, status: 'PLANNED', rocket: 'r3', commander: null, crew: [] },
];

const byId = <T extends { id: string }>(list: T[], id: string | null) => list.find((x) => x.id === id) ?? null;

export const resolvers = {
  Query: {
    missions: (_: unknown, { status }: { status?: string }) =>
      status ? missions.filter((m) => m.status === status) : missions,
    mission: (_: unknown, { id }: { id: string }) => byId(missions, id),
    astronauts: () => astronauts,
  },
  Mutation: {
    addAstronaut: (_: unknown, { input }: { input: { name: string; role: string; nationality: string } }) => {
      const astronaut = { id: 'a' + (astronauts.length + 1), ...input };
      astronauts.push(astronaut);
      return astronaut;
    },
  },
  Mission: {
    rocket: (m: (typeof missions)[number]) => byId(rockets, m.rocket),
    commander: (m: (typeof missions)[number]) => byId(astronauts, m.commander),
    crew: (m: (typeof missions)[number]) => m.crew.map((id) => byId(astronauts, id)),
  },
  Astronaut: {
    missions: (a: { id: string }) => missions.filter((m) => m.crew.includes(a.id)),
  },
};

export const schema = makeExecutableSchema({ typeDefs, resolvers });
