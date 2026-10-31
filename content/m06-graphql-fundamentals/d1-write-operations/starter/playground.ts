import { graphql } from 'graphql';
import { schema } from './api/schema';
import * as ops from './operations';

// Runs an operation against the Mission Control API and prints the result.
async function run(name: string, source: string, variables?: Record<string, unknown>) {
  const result = await graphql({ schema, source, variableValues: variables });
  console.log(`--- ${name}`);
  console.log(JSON.stringify(result, null, 2));
}

await run('MISSIONS_BY_STATUS', ops.MISSIONS_BY_STATUS, { status: 'COMPLETE' });
await run('MISSION_DETAIL', ops.MISSION_DETAIL, { id: 'm2' });
await run('COMPARE_MISSIONS', ops.COMPARE_MISSIONS, { a: 'm1', b: 'm3' });
await run('MISSION_CREW', ops.MISSION_CREW, { id: 'm1' });
await run('ADD_ASTRONAUT', ops.ADD_ASTRONAUT, { input: { name: 'Sally Ride', role: 'ENGINEER', nationality: 'US' } });
