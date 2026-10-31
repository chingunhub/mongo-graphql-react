import { User, createUser } from './server/models/User';

const ada: any = await createUser({ name: 'Ada', email: 'ada@taskforge.dev', password: 'correct horse' } as any);
console.log('as JSON:', ada.toJSON());

const raw = await User.collection.findOne({ _id: ada._id });
console.log('stored in MongoDB:', raw?.password);

const loaded: any = await User.findById(ada._id).select('+password');
console.log('check:', await loaded.checkPassword?.('correct horse'), await loaded.checkPassword?.('wrong'));

await User.updateOne({ _id: ada._id }, { $set: { password: 'a new password' } });
console.log('after updateOne:', (await User.collection.findOne({ _id: ada._id }))?.password);

console.log('login:', await (User as any).findByCredentials?.('ADA@taskforge.dev', 'a new password'));
