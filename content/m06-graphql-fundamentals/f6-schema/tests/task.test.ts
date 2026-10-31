import { expect } from 'expect';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { parse, Kind, type GraphQLSchema, type GraphQLObjectType, type GraphQLInputObjectType, type GraphQLEnumType } from 'graphql';
import { typeDefs } from '../server/graphql/schema';
import { projectTypeDefs } from '../server/graphql/schema/project';
import { issueTypeDefs } from '../server/graphql/schema/issue';
import { commentTypeDefs } from '../server/graphql/schema/comment';

let schema: GraphQLSchema;
function getSchema() {
  if (!schema) {
    try {
      schema = makeExecutableSchema({ typeDefs });
    } catch (e) {
      throw new Error('Your schema does not build: ' + (e as Error).message);
    }
  }
  return schema;
}

function fields(typeName: string) {
  const t = getSchema().getType(typeName) as GraphQLObjectType | GraphQLInputObjectType | undefined;
  if (!t) throw new Error(`Type ${typeName} is missing`);
  return Object.fromEntries(Object.values(t.getFields()).map((f) => [f.name, String(f.type)]));
}

function args(typeName: string, field: string) {
  const t = getSchema().getType(typeName) as GraphQLObjectType;
  const f = t?.getFields()[field];
  if (!f) throw new Error(`${typeName}.${field} is missing`);
  return Object.fromEntries(f.args.map((a) => [a.name, a.defaultValue === undefined ? String(a.type) : `${a.type} = ${a.defaultValue}`]));
}

function enumValues(name: string) {
  const e = getSchema().getType(name) as GraphQLEnumType | undefined;
  if (!e) throw new Error(`Enum ${name} is missing`);
  return e.getValues().map((v) => v.name);
}

/** Root fields a module adds via `extend type X`. */
function extendedRootFields(source: string, root: 'Query' | 'Mutation') {
  return parse(source)
    .definitions.filter((d: any) => d.kind === Kind.OBJECT_TYPE_EXTENSION && d.name.value === root)
    .flatMap((d: any) => d.fields.map((f: any) => f.name.value))
    .sort();
}

test('the schema builds', () => {
  expect(getSchema()).toBeTruthy();
}, { hint: 'Run the playground — it prints the exact build error.' });

test('enums', () => {
  expect(enumValues('IssueStatus')).toEqual(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']);
  expect(enumValues('Priority')).toEqual(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
  expect(enumValues('IssueSort')).toEqual(['NEWEST', 'OLDEST', 'UPDATED']);
});

test('Project fields', () => {
  expect(fields('Project')).toEqual({
    id: 'ID!',
    key: 'String!',
    name: 'String!',
    description: 'String!',
    owner: 'User!',
    members: '[User!]!',
    issues: '[Issue!]!',
    issueCount: 'Int!',
    stats: 'ProjectStats!',
  });
});

test('Project.issues and Project.issueCount arguments (with defaults)', () => {
  expect(args('Project', 'issues')).toEqual({
    filter: 'IssueFilter',
    sort: 'IssueSort = NEWEST',
    limit: 'Int = 20',
    offset: 'Int = 0',
  });
  expect(args('Project', 'issueCount')).toEqual({ filter: 'IssueFilter' });
}, { hint: 'Defaults go after the type: sort: IssueSort = NEWEST' });

test('ProjectStats, StatusCount, Workload', () => {
  expect(fields('ProjectStats')).toEqual({ total: 'Int!', byStatus: '[StatusCount!]!', workload: '[Workload!]!' });
  expect(fields('StatusCount')).toEqual({ status: 'IssueStatus!', count: 'Int!' });
  expect(fields('Workload')).toEqual({ user: 'User!', open: 'Int!' });
});

test('CreateProjectInput', () => {
  expect(fields('CreateProjectInput')).toEqual({ key: 'String!', name: 'String!', description: 'String' });
});

test('Label and Issue fields', () => {
  expect(fields('Label')).toEqual({ name: 'String!', color: 'String!' });
  expect(fields('Issue')).toEqual({
    id: 'ID!',
    number: 'Int!',
    key: 'String!',
    title: 'String!',
    description: 'String!',
    status: 'IssueStatus!',
    priority: 'Priority!',
    labels: '[Label!]!',
    project: 'Project!',
    reporter: 'User!',
    assignee: 'User',
    comments: '[Comment!]!',
    commentCount: 'Int!',
    createdAt: 'String!',
    updatedAt: 'String!',
  });
}, { hint: 'Only assignee may be missing — everything else on Issue is always present.' });

test('issue inputs', () => {
  expect(fields('IssueFilter')).toEqual({
    status: 'IssueStatus',
    priority: 'Priority',
    assigneeId: 'ID',
    label: 'String',
    search: 'String',
  });
  expect(fields('LabelInput')).toEqual({ name: 'String!', color: 'String' });
  expect(fields('CreateIssueInput')).toEqual({
    projectId: 'ID!',
    title: 'String!',
    description: 'String',
    priority: 'Priority',
    assigneeId: 'ID',
    labels: '[LabelInput!]',
  });
  expect(fields('UpdateIssueInput')).toEqual({
    title: 'String',
    description: 'String',
    status: 'IssueStatus',
    priority: 'Priority',
    assigneeId: 'ID',
  });
}, { hint: '"the list itself optional, items non-null" → [LabelInput!]' });

test('Comment', () => {
  expect(fields('Comment')).toEqual({ id: 'ID!', body: 'String!', author: 'User!', createdAt: 'String!' });
});

test('Query root fields', () => {
  const q = fields('Query');
  expect(q.projects).toBe('[Project!]!');
  expect(q.project).toBe('Project');
  expect(q.issue).toBe('Issue');
  expect(args('Query', 'project')).toEqual({ key: 'String!' });
  expect(args('Query', 'issue')).toEqual({ id: 'ID!' });
}, { hint: 'Lookups that may find nothing are nullable: project(key: String!): Project' });

test('Mutation root fields', () => {
  const m = fields('Mutation');
  expect(m).toMatchObject({
    createProject: 'Project!',
    addMember: 'Project!',
    createIssue: 'Issue!',
    updateIssue: 'Issue!',
    deleteIssue: 'ID!',
    addLabel: 'Issue!',
    removeLabel: 'Issue!',
    addComment: 'Comment!',
  });
  expect(args('Mutation', 'createProject')).toEqual({ input: 'CreateProjectInput!' });
  expect(args('Mutation', 'addMember')).toEqual({ projectId: 'ID!', userId: 'ID!' });
  expect(args('Mutation', 'createIssue')).toEqual({ input: 'CreateIssueInput!' });
  expect(args('Mutation', 'updateIssue')).toEqual({ id: 'ID!', input: 'UpdateIssueInput!' });
  expect(args('Mutation', 'deleteIssue')).toEqual({ id: 'ID!' });
  expect(args('Mutation', 'addLabel')).toEqual({ issueId: 'ID!', label: 'LabelInput!' });
  expect(args('Mutation', 'removeLabel')).toEqual({ issueId: 'ID!', name: 'String!' });
  expect(args('Mutation', 'addComment')).toEqual({ issueId: 'ID!', body: 'String!' });
});

test('each domain file extends the roots with its own fields', () => {
  expect(extendedRootFields(projectTypeDefs, 'Query')).toEqual(['project', 'projects']);
  expect(extendedRootFields(projectTypeDefs, 'Mutation')).toEqual(['addMember', 'createProject']);
  expect(extendedRootFields(issueTypeDefs, 'Query')).toEqual(['issue']);
  expect(extendedRootFields(issueTypeDefs, 'Mutation')).toEqual([
    'addLabel',
    'createIssue',
    'deleteIssue',
    'removeLabel',
    'updateIssue',
  ]);
  expect(extendedRootFields(commentTypeDefs, 'Mutation')).toEqual(['addComment']);
}, { hint: 'Use `extend type Query { … }` inside each domain file, like user.ts does.' });
