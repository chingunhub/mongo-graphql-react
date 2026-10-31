import type { CodegenConfig } from '@graphql-codegen/cli';
const config: CodegenConfig = {
  schema: 'schema.graphql',
  documents: ['web/operations.ts'],
  generates: {
    'web/generated/graphql.ts': {
      plugins: ['typescript', 'typescript-operations'],
    },
  },
};
export default config;
