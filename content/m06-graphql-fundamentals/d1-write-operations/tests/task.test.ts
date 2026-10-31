import { expect } from 'expect';
import { graphql, parse, validate, print, Kind, type DocumentNode, type OperationDefinitionNode } from 'graphql';
import { schema } from '../api/schema';
import * as ops from '../operations';

function document(source: string): DocumentNode {
  let doc: DocumentNode;
  try {
    doc = parse(source);
  } catch (e) {
    throw new Error('Syntax error: ' + (e as Error).message);
  }
  const errors = validate(schema, doc);
  if (errors.length) throw new Error('Invalid against the schema: ' + errors.map((e) => e.message).join('; '));
  return doc;
}

function operation(source: string): OperationDefinitionNode {
  const ops = document(source).definitions.filter((d) => d.kind === Kind.OPERATION_DEFINITION) as OperationDefinitionNode[];
  if (ops.length !== 1) throw new Error(`Expected exactly one operation, found ${ops.length}`);
  return ops[0];
}

function variables(op: OperationDefinitionNode) {
  return Object.fromEntries(op.variableDefinitions!.map((v) => [v.variable.name.value, print(v.type)]));
}

async function run(source: string, variableValues: Record<string, unknown>) {
  const res = await graphql({ schema, source, variableValues });
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '));
  return res.data;
}

describe('MISSIONS_BY_STATUS', () => {
  test('is a query named MissionsByStatus with a required $status: MissionStatus!', () => {
    const op = operation(ops.MISSIONS_BY_STATUS);
    expect(op.operation).toBe('query');
    expect(op.name?.value).toBe('MissionsByStatus');
    expect(variables(op)).toEqual({ status: 'MissionStatus!' });
  }, { hint: 'query MissionsByStatus($status: MissionStatus!) { … }' });

  test('returns exactly name and launchYear, and uses the variable', async () => {
    expect(await run(ops.MISSIONS_BY_STATUS, { status: 'COMPLETE' })).toEqual({
      missions: [
        { name: 'Apollo 11', launchYear: 1969 },
        { name: 'Demo-2', launchYear: 2020 },
      ],
    });
    expect(await run(ops.MISSIONS_BY_STATUS, { status: 'PLANNED' })).toEqual({
      missions: [{ name: 'Artemis III', launchYear: null }],
    });
  });
});

describe('MISSION_DETAIL', () => {
  test('is a query named MissionDetail with $id: ID!', () => {
    const op = operation(ops.MISSION_DETAIL);
    expect(op.name?.value).toBe('MissionDetail');
    expect(variables(op)).toEqual({ id: 'ID!' });
  });

  test('selects mission, rocket and crew fields exactly', async () => {
    expect(await run(ops.MISSION_DETAIL, { id: 'm3' })).toEqual({
      mission: {
        name: 'Demo-2',
        status: 'COMPLETE',
        rocket: { name: 'Falcon 9', reusable: true },
        crew: [
          { name: 'Bob Behnken', role: 'COMMANDER' },
          { name: 'Doug Hurley', role: 'PILOT' },
        ],
      },
    });
  }, { hint: 'Nested selections: rocket { … } and crew { … }.' });
});

describe('COMPARE_MISSIONS', () => {
  test('is a query named CompareMissions with $a: ID! and $b: ID!', () => {
    const op = operation(ops.COMPARE_MISSIONS);
    expect(op.name?.value).toBe('CompareMissions');
    expect(variables(op)).toEqual({ a: 'ID!', b: 'ID!' });
  });

  test('returns both missions under the aliases first and second', async () => {
    expect(await run(ops.COMPARE_MISSIONS, { a: 'm1', b: 'm2' })).toEqual({
      first: { name: 'Apollo 11', launchYear: 1969 },
      second: { name: 'Artemis II', launchYear: 2026 },
    });
  }, { hint: 'first: mission(id: $a) { … }' });
});

describe('MISSION_CREW', () => {
  test('is a query named MissionCrew with $id: ID!', () => {
    const op = operation(ops.MISSION_CREW);
    expect(op.name?.value).toBe('MissionCrew');
    expect(variables(op)).toEqual({ id: 'ID!' });
  });

  test('defines fragment CrewMember on Astronaut and spreads it twice', () => {
    const doc = document(ops.MISSION_CREW);
    const frag = doc.definitions.find((d) => d.kind === Kind.FRAGMENT_DEFINITION) as any;
    expect(frag?.name.value).toBe('CrewMember');
    expect(frag?.typeCondition.name.value).toBe('Astronaut');
    const spreads = (print(doc).match(/\.\.\.CrewMember/g) ?? []).length;
    expect(spreads).toBe(2);
  }, { hint: 'fragment CrewMember on Astronaut { name role nationality } — then ...CrewMember under commander and crew.' });

  test('returns commander and crew with name, role, nationality', async () => {
    expect(await run(ops.MISSION_CREW, { id: 'm2' })).toEqual({
      mission: {
        name: 'Artemis II',
        commander: { name: 'Reid Wiseman', role: 'COMMANDER', nationality: 'US' },
        crew: [
          { name: 'Reid Wiseman', role: 'COMMANDER', nationality: 'US' },
          { name: 'Jeremy Hansen', role: 'SCIENTIST', nationality: 'CA' },
          { name: 'Christina Koch', role: 'ENGINEER', nationality: 'US' },
        ],
      },
    });
  });
});

describe('ADD_ASTRONAUT', () => {
  test('is a mutation named AddAstronaut with $input: AddAstronautInput!', () => {
    const op = operation(ops.ADD_ASTRONAUT);
    expect(op.operation).toBe('mutation');
    expect(op.name?.value).toBe('AddAstronaut');
    expect(variables(op)).toEqual({ input: 'AddAstronautInput!' });
  }, { hint: 'The argument is addAstronaut(input: AddAstronautInput!).' });

  test('returns id, name and role of the new astronaut', async () => {
    const data: any = await run(ops.ADD_ASTRONAUT, { input: { name: 'Sally Ride', role: 'ENGINEER', nationality: 'US' } });
    expect(Object.keys(data.addAstronaut).sort()).toEqual(['id', 'name', 'role']);
    expect(data.addAstronaut.name).toBe('Sally Ride');
    expect(data.addAstronaut.role).toBe('ENGINEER');
  });
});
