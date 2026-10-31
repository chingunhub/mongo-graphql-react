import { expect } from 'expect';
import { resetDb } from '@forge/kit';
import { User, ROLES, createUser, findUserByEmail, listUsers } from '../server/models/User';

beforeEach(resetDb);

test('exports ROLES = ["MEMBER", "ADMIN"]', () => {
  expect([...ROLES]).toEqual(['MEMBER', 'ADMIN']);
});

test('createUser saves a user with a trimmed name and normalized email', async () => {
  const u: any = await createUser({ name: '  Ada Lovelace ', email: '  Ada@Taskforge.DEV ' });
  expect(u).toBeDefined();
  expect(u.name).toBe('Ada Lovelace');
  expect(u.email).toBe('ada@taskforge.dev');
  expect(await User.countDocuments()).toBe(1);
}, { hint: 'email needs both trim and lowercase.' });

test('role defaults to MEMBER', async () => {
  const u: any = await createUser({ name: 'Grace', email: 'grace@taskforge.dev' });
  expect(u.role).toBe('MEMBER');
});

test('role must be MEMBER or ADMIN', async () => {
  const admin: any = await createUser({ name: 'Ada', email: 'ada@taskforge.dev', role: 'ADMIN' });
  expect(admin.role).toBe('ADMIN');
  await expect(createUser({ name: 'Eve', email: 'eve@taskforge.dev', role: 'OWNER' as any })).rejects.toThrow(/role/);
}, { hint: 'Use the enum option on the role field.' });

test('name and email are required', async () => {
  await expect(createUser({ email: 'x@taskforge.dev' } as any)).rejects.toThrow(/name/);
  await expect(createUser({ name: 'X' } as any)).rejects.toThrow(/email/);
});

test('users have createdAt / updatedAt', async () => {
  const u: any = await createUser({ name: 'Grace', email: 'grace@taskforge.dev' });
  expect(u.createdAt).toBeInstanceOf(Date);
  expect(u.updatedAt).toBeInstanceOf(Date);
});

test('findUserByEmail ignores case and surrounding spaces', async () => {
  await createUser({ name: 'Ada', email: 'ada@taskforge.dev' });
  const found: any = await findUserByEmail('   ADA@Taskforge.dev ');
  expect(found).not.toBeNull();
  expect(found.name).toBe('Ada');
});

test('findUserByEmail returns null for unknown emails', async () => {
  await createUser({ name: 'Ada', email: 'ada@taskforge.dev' });
  expect(await findUserByEmail('nobody@taskforge.dev')).toBeNull();
});

test('listUsers sorts by name A→Z', async () => {
  await User.create([
    { name: 'Linus', email: 'l@t.dev' },
    { name: 'Ada', email: 'a@t.dev' },
    { name: 'Grace', email: 'g@t.dev' },
  ]);
  const users = await listUsers();
  expect(users.map((u: any) => u.name)).toEqual(['Ada', 'Grace', 'Linus']);
});
