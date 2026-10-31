import { createUser, findUserByEmail, listUsers } from './server/models/User';

await createUser({ name: 'Grace Hopper', email: 'grace@taskforge.dev' });
await createUser({ name: ' Ada Lovelace ', email: ' Ada@Taskforge.DEV', role: 'ADMIN' });

console.log(await findUserByEmail('  ADA@taskforge.dev '));
console.log((await listUsers()).map((u: any) => u.name));
