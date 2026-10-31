import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ROOT, CONTENT_DIR, DATA_DIR } from './paths.js';
import { writeTree, type Files } from './runner.js';
import { workspaceFiles, workspaceStatus } from './workspaces.js';
import type { Curriculum } from './content.js';
import type { Progress } from './progress.js';

// The lockfile, not node_modules: an installed copy has no dev dependencies, and the export still pins them.
function version(name: string) {
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
  return lock.packages['node_modules/' + name].version as string;
}
export function relaydeskScaffold(mode: 'mine' | 'reference', complete: boolean): Files {
  const dependencies = Object.fromEntries(
    [
      '@apollo/client',
      '@apollo/server',
      '@apollo/subgraph',
      '@apollo/gateway',
      '@trpc/client',
      '@trpc/server',
      'bullmq',
      'ioredis',
      'dataloader',
      'express',
      'graphql',
      'mongoose',
      'react',
      'react-dom',
      'react-hook-form',
      '@hookform/resolvers',
      'zod',
      'esbuild',
    ].map((name) => [name, version(name)]),
  );
  const devDependencies = Object.fromEntries(
    [
      '@types/express',
      '@types/node',
      '@types/react',
      '@types/react-dom',
      'typescript',
      'tsx',
      'nx',
      '@graphql-codegen/cli',
      '@graphql-codegen/typescript',
      '@graphql-codegen/typescript-operations',
    ].map((name) => [name, version(name)]),
  );
  const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
  const files: Files = {
    'package.json': json({
      name: 'relaydesk',
      version: '0.1.0',
      private: true,
      type: 'module',
      packageManager: 'pnpm@9.12.3',
      scripts: {
        codegen: 'graphql-codegen --config codegen.ts',
        typecheck: 'tsc -p tsconfig.json',
        build: 'graphql-codegen --config codegen.ts && tsc -p tsconfig.json',
        start: 'node --import tsx runtime/cli.ts',
        graph: 'nx graph',
      },
      dependencies,
      devDependencies,
    }),
    'pnpm-workspace.yaml':
      "packages:\n  - 'packages/*'\n  - 'services'\n  - 'services/*'\n  - 'runtime'\n  - 'web'\n",
    'nx.json': json({
      defaultBase: 'main',
      namedInputs: {
        default: [
          '{projectRoot}/**/*',
          '{workspaceRoot}/tsconfig.base.json',
          '{workspaceRoot}/package.json',
          '{workspaceRoot}/pnpm-lock.yaml',
        ],
      },
      targetDefaults: {
        typecheck: {
          cache: true,
          dependsOn: ['^typecheck'],
          inputs: ['default', '^default'],
        },
      },
    }),
    'tsconfig.base.json': json({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        esModuleInterop: true,
        types: ['node'],
        lib: ['ES2023', 'DOM', 'DOM.Iterable'],
      },
    }),
    'tsconfig.json': json({
      extends: './tsconfig.base.json',
      include: ['packages', 'services', 'runtime', 'web'],
      exclude: ['web/preview.tsx'],
    }),
    '.gitignore': 'node_modules/\n.nx/\npublic/\n*.log\n',
    'compose.yaml':
      'services:\n  redis:\n    image: redis:7.4-alpine\n    ports:\n      - "127.0.0.1:6397:6379"\n    command: redis-server --appendonly yes\n    volumes:\n      - relaydesk-redis:/data\nvolumes:\n  relaydesk-redis:\n',
    'EXPORT.json': json({
      mode,
      complete,
      createdAt: new Date().toISOString(),
      note:
        mode === 'mine'
          ? 'Saved learner files plus TODO starters; no reference answers were inserted.'
          : 'Explicit reference export, separate from learner progress.',
    }),
    'README.md': [
      '# Relaydesk — ' + (mode === 'mine' ? 'your workspace' : 'reference workspace'),
      '',
      'A local support-system lab with real Mongoose, HTTP Apollo Federation subgraphs, a tRPC service and a React/Apollo console.',
      '',
      complete
        ? 'All curriculum steps were marked passed at export time. Re-run checks after edits.'
        : 'This export can contain unfinished TODOs. Complete the forge steps before expecting it to boot.',
      '',
      '## Run from Git Bash',
      '',
      'Requires Node 24+ and local MongoDB on 127.0.0.1:27017. If pnpm is not installed, use npx pnpm@9.12.3 in place of pnpm.',
      '',
      '```bash',
      'pnpm install',
      'pnpm run build',
      'pnpm start',
      '```',
      '',
      'Open http://127.0.0.1:4810. Choose North/South and Agent/Reader in the console. Credentials are synthetic local demo tokens; this is not production authentication.',
      '',
      'The CLI seeds one contact and welcome ticket per tenant without clearing existing records. RELAYDESK_RESET=1 resets only the dedicated forge_ demo collections. Do not point this lab at a production database.',
      '',
      '## Observe the monorepo',
      '',
      '```bash',
      'pnpm exec nx show projects',
      'pnpm exec nx graph --file=dependency-graph.html',
      'pnpm exec nx run-many -t typecheck',
      '```',
      '',
      'Project graph dependencies are declared explicitly to make ownership reviewable. Type-only client imports still depend on the service contract. GraphQL Code Generator validates web/operations.ts against schema.graphql and emits web/generated/graphql.ts. If you change a subgraph contract, update the public GraphQL schema snapshot and regenerate.',
      '',
      '## Real BullMQ transport',
      '',
      'Start an isolated Memurai or Redis instance on 127.0.0.1:6397. The Academy repository includes npm run queue:lab for the installed Windows Memurai executable; alternatively run docker compose up -d redis in this folder.',
      '',
      '```bash',
      'RELAYDESK_REDIS=redis://127.0.0.1:6397 pnpm start',
      '```',
      '',
      'This mode creates a real Queue, Worker and QueueEvents, waits for the worker result before acknowledging intent, and keeps a durable MongoDB activity receipt. Without RELAYDESK_REDIS, the dispatcher calls the same consumer directly. The two modes are labeled by /health.',
      '',
      'Use a unique RELAYDESK_QUEUE_PREFIX and RELAYDESK_MONGO for a second copy. RELAYDESK_PORT selects the public port; subgraphs choose free loopback ports. Ctrl+C closes HTTP servers, workers and MongoDB.',
      '',
      '## Boundaries',
      '',
      'One Node process owns several real loopback HTTP listeners. This makes local lifecycle inspection practical; it does not test independent-host deployment, a killed worker process, WAN partitions or production session revocation. The local client shell is not a deployed Module Federation remote host. The event receipt makes one activity insertion idempotent; it does not prove external email delivery exactly once.',
      '',
      'Final investigation: retry intake, issue a stale triage mutation, simulate delivery outage, recover pending work, and verify the other tenant is unchanged. Write the evidence before proposing a fix.',
      '',
    ].join('\n'),
  };
  const projects = [
    { name: 'contracts', root: 'packages/contracts', deps: [] },
    { name: 'contacts', root: 'services/contacts', deps: ['contracts'] },
    { name: 'tickets', root: 'services/tickets', deps: ['contracts'] },
    { name: 'activity', root: 'services/activity', deps: ['contracts'] },
    {
      name: 'api',
      root: 'services',
      deps: ['contracts', 'contacts', 'tickets', 'activity'],
    },
    {
      name: 'runtime',
      root: 'runtime',
      deps: ['api', 'contracts', 'contacts', 'tickets', 'activity'],
    },
    { name: 'console', root: 'web', deps: ['api', 'codegen'] },
  ];
  for (const project of projects) {
    const depth = project.root.split('/').length;
    files[project.root + '/package.json'] = json({
      name: '@relaydesk/' + project.name,
      version: '0.1.0',
      private: true,
      type: 'module',
      dependencies: Object.fromEntries(
        project.deps
          .filter((name) => name !== 'codegen')
          .map((name) => ['@relaydesk/' + name, 'workspace:*']),
      ),
    });
    files[project.root + '/project.json'] = json({
      name: project.name,
      implicitDependencies: project.deps,
      targets: {
        typecheck: {
          executor: 'nx:run-commands',
          options: { command: 'tsc -p ' + project.root + '/tsconfig.json' },
          ...(project.name === 'console'
            ? {
                dependsOn: ['^typecheck', { target: 'generate', projects: ['codegen'] }],
              }
            : {}),
        },
      },
    });
    files[project.root + '/tsconfig.json'] = json({
      extends: '../'.repeat(depth) + 'tsconfig.base.json',
      include: project.name === 'api' ? ['*.ts'] : ['**/*.ts', '**/*.tsx'],
      exclude: project.name === 'console' ? ['preview.tsx'] : [],
    });
  }
  files['tools/codegen/project.json'] = json({
    name: 'codegen',
    targets: {
      generate: {
        executor: 'nx:run-commands',
        cache: true,
        inputs: [
          '{workspaceRoot}/schema.graphql',
          '{workspaceRoot}/web/operations.ts',
          '{workspaceRoot}/codegen.ts',
          '{workspaceRoot}/pnpm-lock.yaml',
        ],
        outputs: ['{workspaceRoot}/web/generated/graphql.ts'],
        options: { command: 'graphql-codegen --config codegen.ts' },
      },
    },
  });
  const lock = join(CONTENT_DIR, '_relaydesk', 'pnpm-lock.yaml');
  if (existsSync(lock)) files['pnpm-lock.yaml'] = readFileSync(lock, 'utf8');
  return files;
}
export async function exportRelaydesk(cur: Curriculum, progress: Progress, mode: 'mine' | 'reference') {
  const status = workspaceStatus(cur, progress, 'relaydesk');
  const files = {
    ...workspaceFiles(cur, progress, 'relaydesk', mode),
    ...relaydeskScaffold(mode, mode === 'reference' || status.complete),
  };
  const parent = join(DATA_DIR, 'exports'); // updates replace the program folder, so not there
  await mkdir(parent, { recursive: true });
  const dir = join(
    parent,
    'relaydesk-' + mode + '-' + Date.now().toString(36) + '-' + randomBytes(3).toString('hex'),
  );
  await mkdir(dir);
  await writeTree(dir, files);
  return {
    directory: dir,
    files: Object.keys(files).length,
    mode,
    complete: mode === 'reference' || status.complete,
  };
}
