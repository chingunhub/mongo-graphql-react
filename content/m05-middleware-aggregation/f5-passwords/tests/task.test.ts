import { expect } from 'expect';
import { resetDb, ensureIndexes } from '@forge/kit';
import { User, createUser } from '../server/models/User';
import { isHashed, verifyPassword } from '../server/auth/password';

const U = User as any;
const raw = async (id: unknown) => (await User.collection.findOne({ _id: id as any }))?.password;

beforeAll(async () => {
  await ensureIndexes(User);
});
beforeEach(resetDb);

const make = (password = 'correct horse') =>
  createUser({ name: 'Ada', email: 'ada@taskforge.dev', password } as any) as Promise<any>;

test('passwords are stored hashed on create', async () => {
  const ada = await make();
  const stored = await raw(ada._id);
  expect(isHashed(stored)).toBe(true);
  expect(verifyPassword('correct horse', stored)).toBe(true);
}, { hint: "pre('save'): if this.isModified('password') → hashPassword(...)" });

test('short passwords are rejected with the custom message', async () => {
  await expect(make('short')).rejects.toThrow('Password must be at least 8 characters');
});

test('users without a password are allowed', async () => {
  const u: any = await createUser({ name: 'Invited', email: 'inv@taskforge.dev' });
  expect(await raw(u._id)).toBeUndefined();
});

test('the password is not returned by default', async () => {
  const ada = await make();
  const found: any = await User.findById(ada._id).lean();
  expect(found.password).toBeUndefined();
  const withPw: any = await User.findById(ada._id).select('+password').lean();
  expect(isHashed(withPw.password)).toBe(true);
}, { hint: 'select: false on the field.' });

test('saving other changes does not re-hash', async () => {
  const ada = await make();
  const before = await raw(ada._id);
  const loaded: any = await User.findById(ada._id).select('+password');
  loaded.name = 'Ada L.';
  await loaded.save();
  expect(await raw(ada._id)).toBe(before);
});

test('changing the password through a document re-hashes it', async () => {
  const ada = await make();
  const loaded: any = await User.findById(ada._id);
  loaded.password = 'brand new secret';
  await loaded.save();
  expect(verifyPassword('brand new secret', await raw(ada._id))).toBe(true);
});

test('checkPassword resolves true/false', async () => {
  const ada = await make();
  const loaded: any = await User.findById(ada._id).select('+password');
  expect(await loaded.checkPassword('correct horse')).toBe(true);
  expect(await loaded.checkPassword('wrong horse')).toBe(false);
});

test('checkPassword throws if the password was not loaded', async () => {
  const ada = await make();
  const loaded: any = await User.findById(ada._id);
  await expect(Promise.resolve().then(() => loaded.checkPassword('correct horse'))).rejects.toThrow();
}, { hint: "If this.password is undefined, the field wasn't selected — throw a helpful Error." });

test('toJSON never includes the password', async () => {
  const ada = await make();
  expect(ada.toJSON().password).toBeUndefined();
  const loaded: any = await User.findById(ada._id).select('+password');
  expect(loaded.toJSON().password).toBeUndefined();
  expect(loaded.toJSON().email).toBe('ada@taskforge.dev');
}, { hint: "userSchema.set('toJSON', { transform: (_doc, ret) => { delete ret.password; return ret; } })" });

test('findByCredentials: right password → user, otherwise null', async () => {
  await make();
  const ok = await U.findByCredentials('  ADA@Taskforge.dev ', 'correct horse');
  expect(ok?.name).toBe('Ada');
  expect(await U.findByCredentials('ada@taskforge.dev', 'nope nope nope')).toBeNull();
  expect(await U.findByCredentials('nobody@taskforge.dev', 'correct horse')).toBeNull();
});

test('updateOne with { password } stores a hash', async () => {
  const ada = await make();
  await User.updateOne({ _id: ada._id }, { password: 'reset via update' });
  const stored = await raw(ada._id);
  expect(isHashed(stored)).toBe(true);
  expect(verifyPassword('reset via update', stored)).toBe(true);
}, { hint: "Query middleware: pre(['updateOne', 'findOneAndUpdate'], function () { this.getUpdate() ... })" });

test('findOneAndUpdate with { $set: { password } } stores a hash', async () => {
  const ada = await make();
  await User.findOneAndUpdate({ _id: ada._id }, { $set: { password: 'reset via $set' } });
  expect(verifyPassword('reset via $set', await raw(ada._id))).toBe(true);
});

test('updates reject short passwords and leave the old one', async () => {
  const ada = await make();
  const before = await raw(ada._id);
  await expect(User.updateOne({ _id: ada._id }, { $set: { password: 'short' } })).rejects.toThrow(
    'Password must be at least 8 characters',
  );
  expect(await raw(ada._id)).toBe(before);
});

test('updates that do not touch the password leave it alone', async () => {
  const ada = await make();
  const before = await raw(ada._id);
  await User.updateOne({ _id: ada._id }, { $set: { name: 'Ada L.' } });
  expect(await raw(ada._id)).toBe(before);
});
