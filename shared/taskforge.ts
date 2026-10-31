import type { JourneyFrame, ProjectLayer } from './relaydesk.js';

export type TaskforgeJourney = 'login' | 'board' | 'move';

export interface TaskforgeStage {
  id: string;
  from: string;
  title: string;
  detail: string;
  auth: boolean;
  web: 'list' | 'app' | null;
  ownBoot: boolean;
}

/** What you can run from each passed step. Later stages replace supplied pieces with your own. */
export const taskforgeStages: TaskforgeStage[] = [
  {
    id: 'api',
    from: 'm07/f7-resolvers',
    title: 'Your API, running as Ada',
    detail:
      'Your schema, resolvers and models over real HTTP. Auth does not exist yet, so a supplied context treats every request as Ada.',
    auth: false,
    web: null,
    ownBoot: false,
  },
  {
    id: 'auth',
    from: 'm08/f8-auth',
    title: 'Your API, with real auth',
    detail: 'Requests now pass through your context, permissions and errors. The explorer logs in as Ada first.',
    auth: true,
    web: null,
    ownBoot: false,
  },
  {
    id: 'list',
    from: 'm10/f10-issue-list',
    title: 'Your API and your first screen',
    detail: 'Your Apollo client and IssueList, talking to your own API instead of the reference one.',
    auth: true,
    web: 'list',
    ownBoot: false,
  },
  {
    id: 'app',
    from: 'm12/f12-board',
    title: 'Your whole app, on a supplied boot',
    detail: 'The complete board on your API. A supplied entry point starts the server until you write your own.',
    auth: true,
    web: 'app',
    ownBoot: false,
  },
  {
    id: 'own',
    from: 'm13/f13-boot',
    title: 'Your whole app, on your own server',
    detail: 'Everything here is yours: server/index.ts boots the API and your React app runs on top of it.',
    auth: true,
    web: 'app',
    ownBoot: true,
  },
];

export const taskforgeLayers: ProjectLayer[] = [
  {
    name: 'React client',
    color: 'var(--react)',
    pieces: [
      {
        id: 'app',
        label: 'App + login',
        file: 'web/App.tsx',
        lesson: 'm12/l1-fragments',
        role: 'provided',
        why: 'Holds the session and decides between the login form and the board, so your components can focus on data.',
      },
      {
        id: 'apollo',
        label: 'Apollo client',
        file: 'web/apollo.ts',
        step: 'm10/f10-issue-list',
        role: 'build',
        why: 'One client owns the link chain and the normalized cache. Every request leaves through here with the current token.',
      },
      {
        id: 'list',
        label: 'Issue list',
        file: 'web/components/IssueList.tsx',
        step: 'm10/f10-issue-list',
        role: 'build',
        why: 'Your first screen on live data, with its loading, empty and error states handled honestly.',
      },
      {
        id: 'create',
        label: 'Create issue form',
        file: 'web/components/CreateIssueForm.tsx',
        step: 'm11/f11-create-move',
        role: 'build',
        why: 'A mutation that adds to a list. The cache cannot guess where a new issue belongs, so you tell it.',
      },
      {
        id: 'status',
        label: 'Status select',
        file: 'web/components/StatusSelect.tsx',
        step: 'm11/f11-create-move',
        role: 'build',
        why: 'An optimistic update: the board moves immediately, and a failed request has to undo it cleanly.',
      },
      {
        id: 'card',
        label: 'Issue card',
        file: 'web/components/IssueCard.tsx',
        step: 'm12/f12-board',
        role: 'build',
        why: 'A component that declares its own data needs with a fragment, so parents never have to know them.',
      },
      {
        id: 'board',
        label: 'Board',
        file: 'web/components/Board.tsx',
        step: 'm12/f12-board',
        role: 'build',
        why: 'Columns over one paginated connection, with Load more merging pages in the cache.',
      },
    ],
  },
  {
    name: 'GraphQL API',
    color: 'var(--gql)',
    pieces: [
      {
        id: 'boot',
        label: 'Server entry',
        file: 'server/index.ts',
        step: 'm13/f13-boot',
        role: 'build',
        why: 'Connects to MongoDB, builds indexes and starts serving. Nothing runs on import; the caller decides when.',
      },
      {
        id: 'schema',
        label: 'Schema',
        file: 'server/graphql/schema/issue.ts',
        step: 'm06/f6-schema',
        role: 'build',
        why: 'The contract with the frontend, agreed before any resolver exists.',
      },
      {
        id: 'server',
        label: 'Apollo Server',
        file: 'server/graphql/server.ts',
        step: 'm07/f7-resolvers',
        role: 'build',
        why: 'Joins the schema and resolvers into one server, and later decides how errors leave it.',
      },
      {
        id: 'resolvers',
        label: 'Resolvers',
        file: 'server/graphql/resolvers/issue.ts',
        step: 'm07/f7-resolvers',
        role: 'build',
        why: 'Thin functions between the schema and the data layer. Domain rules stay out of here.',
      },
      {
        id: 'context',
        label: 'Request context',
        file: 'server/graphql/context.ts',
        step: 'm08/f8-auth',
        role: 'build',
        why: 'Built once per request. It answers who is asking, and it holds anything that must not outlive the request.',
      },
      {
        id: 'permissions',
        label: 'Permissions',
        file: 'server/services/permissions.ts',
        step: 'm08/f8-auth',
        role: 'build',
        why: 'Authorization in one place, so a new resolver cannot quietly invent its own rule.',
      },
      {
        id: 'errors',
        label: 'Error policy',
        file: 'server/graphql/errors.ts',
        step: 'm08/f8-auth',
        role: 'build',
        why: 'Clients get stable error codes. Internal details stay in the server logs.',
      },
      {
        id: 'loaders',
        label: 'DataLoaders',
        file: 'server/graphql/loaders.ts',
        step: 'm09/f9-loaders',
        role: 'build',
        why: 'Collects the field lookups from one request into one database query.',
      },
      {
        id: 'pagination',
        label: 'Cursor pagination',
        file: 'server/graphql/pagination.ts',
        step: 'm09/f9-connections',
        role: 'build',
        why: 'Pages that stay correct while rows are being added above them.',
      },
      {
        id: 'search',
        label: 'Search union',
        file: 'server/graphql/resolvers/search.ts',
        step: 'm09/f9-connections',
        role: 'build',
        why: 'One field that can return different types, resolved to the right one at runtime.',
      },
    ],
  },
  {
    name: 'Mongoose data',
    color: 'var(--mongo)',
    pieces: [
      {
        id: 'user',
        label: 'User',
        file: 'server/models/User.ts',
        step: 'm01/f1-user-model',
        role: 'build',
        why: 'The first model, later joined by password hooks that make storing plain text impossible by accident.',
      },
      {
        id: 'project',
        label: 'Project',
        file: 'server/models/Project.ts',
        step: 'm02/f2-projects-issues',
        role: 'build',
        why: 'Owns its members and the short key that appears in every issue number.',
      },
      {
        id: 'issue',
        label: 'Issue',
        file: 'server/models/Issue.ts',
        step: 'm02/f2-projects-issues',
        role: 'build',
        why: 'The busiest document in the system: validation, indexes, numbering and search all land here.',
      },
      {
        id: 'comment',
        label: 'Comment',
        file: 'server/models/Comment.ts',
        step: 'm04/f4-comments',
        role: 'build',
        why: 'A separate collection joined to issues, because comments grow without limit.',
      },
      {
        id: 'repository',
        label: 'Issue repository',
        file: 'server/repositories/issues.ts',
        step: 'm03/f3-issue-repository',
        role: 'build',
        why: 'Every issue query lives here, so resolvers ask for outcomes and never build filters themselves.',
      },
      {
        id: 'password',
        label: 'Password hashing',
        file: 'server/auth/password.ts',
        step: 'm05/f5-passwords',
        role: 'provided',
        why: 'Supplied hashing helpers. Your job is to call them at the right moment in the save lifecycle.',
      },
      {
        id: 'counter',
        label: 'Issue numbers',
        file: 'server/models/Counter.ts',
        step: 'm05/f5-numbers-stats',
        role: 'build',
        why: 'An atomic counter, so two people creating an issue at once can never get the same number.',
      },
      {
        id: 'stats',
        label: 'Project stats',
        file: 'server/services/stats.ts',
        step: 'm05/f5-numbers-stats',
        role: 'build',
        why: 'An aggregation pipeline behind the numbers at the top of a project.',
      },
    ],
  },
  {
    name: 'Full stack',
    color: 'var(--forge)',
    pieces: [
      {
        id: 'dates',
        label: 'Due dates',
        file: 'server/lib/dates.ts',
        step: 'm13/f13-due-dates',
        role: 'provided',
        why: 'One feature through every layer. This supplied date helper is its only shortcut.',
      },
    ],
  },
];

export const taskforgePieces = taskforgeLayers.flatMap((layer) => layer.pieces);

export const taskforgeJourneyOptions: { id: TaskforgeJourney; label: string }[] = [
  { id: 'login', label: 'Log in' },
  { id: 'board', label: 'Load the board' },
  { id: 'move', label: 'Move an issue' },
];

export function taskforgeJourney(kind: TaskforgeJourney): JourneyFrame[] {
  if (kind === 'login')
    return [
      {
        at: 'app',
        title: 'The form submits a mutation',
        detail: 'Logging in is an ordinary GraphQL mutation. Nothing about it is special to the transport.',
        payload: 'mutation Login($email: String!, $password: String!) {\n  login(email: $email, password: $password) { token user { id name } }\n}',
      },
      {
        at: 'resolvers',
        title: 'The resolver delegates',
        detail: 'The resolver finds the user and hands password checking to the model layer.',
        payload: 'Mutation.login → User lookup → compare password',
      },
      {
        at: 'user',
        title: 'The hash is compared, never decrypted',
        detail:
          'The stored password is a one-way hash. A wrong email and a wrong password produce the same error, so the API does not reveal who has an account.',
        payload: 'password: hidden from normal queries, selected only for this check',
      },
      {
        at: 'apollo',
        title: 'The token rides on every later request',
        detail: 'The client stores the token. Its auth link reads it fresh for each request.',
        payload: 'Authorization: Bearer <token>',
      },
      {
        at: 'context',
        title: 'Each request proves who it is',
        detail: 'The context turns a valid token back into a freshly loaded user, or into nobody at all.',
        payload: '{ currentUser: User | null, loaders }',
      },
    ];
  if (kind === 'board')
    return [
      {
        at: 'board',
        title: 'The board asks for one query',
        detail: 'The query is built from fragments, so each component contributes exactly the fields it renders.',
        payload: 'query BoardIssues($key: String!, $first: Int!, $after: String) {\n  project(key: $key) {\n    issueConnection(first: $first, after: $after) {\n      edges { node { ...IssueCard } }\n      pageInfo { hasNextPage endCursor }\n    }\n  }\n}',
      },
      {
        at: 'apollo',
        title: 'The cache gets the first look',
        detail: 'On a miss, the operation leaves through the auth link and over HTTP.',
        payload: 'cache miss → auth link → POST /graphql',
      },
      {
        at: 'context',
        title: 'A request context is built',
        detail: 'Fresh loaders are created here because their cache must die with this request.',
        payload: 'buildContext({ req }) → { currentUser, loaders }',
      },
      {
        at: 'pagination',
        title: 'The connection fetches one page',
        detail: 'A compound index makes this a short range scan, even with thousands of issues in the project.',
        payload: '{ project, cursor } → edges + pageInfo',
      },
      {
        at: 'loaders',
        title: 'Field lookups collapse into one',
        detail: 'Twenty cards ask for twenty assignees. The loader waits one tick and sends a single $in query.',
        payload: '20 × assignee → 1 × User.find({ _id: { $in: [...] } })',
      },
      {
        at: 'card',
        title: 'The cache renders the cards',
        detail: 'Results are normalized by type and id. Each card reads its own fragment from that store.',
        payload: 'Issue:abc → card, User:def → assignee avatar',
      },
    ];
  return [
    {
      at: 'status',
      title: 'The select changes at once',
      detail: 'An optimistic result is written to a separate cache layer before the request even leaves.',
      payload: 'optimistic layer: Issue:abc.status = DONE',
    },
    {
      at: 'context',
      title: 'The server checks who is asking',
      detail: 'A logged-out request stops here, before any data is read.',
      payload: 'currentUser → required',
    },
    {
      at: 'permissions',
      title: 'Write access is checked in one place',
      detail: 'Admins, the owner and members may change a project. Everyone else stops here.',
      payload: 'assertCanWriteProject(user, projectId)',
    },
    {
      at: 'repository',
      title: 'Validation runs on the update',
      detail: 'Updates do not run validators by default. The repository has to ask for them.',
      payload: 'findByIdAndUpdate(id, { $set }, { runValidators: true })',
    },
    {
      at: 'card',
      title: 'The real answer replaces the guess',
      detail: 'The response carries id and __typename, so the cache updates the same object and every view follows.',
      payload: 'success → keep the server result\nfailure → drop the optimistic layer, the card moves back',
    },
  ];
}
