import { Article } from './models/Article';

const a: any = await Article.create({ title: 'Why Mongo Indexes Matter!' });
console.log('slug:', a.slug);

a.body = 'Edited body';
await a.save();
console.log('slug after body edit:', a.slug);

await a.softDelete?.();
console.log('visible:', await Article.countDocuments());
console.log('with deleted:', await Article.find().setOptions({ withDeleted: true }).countDocuments());
console.log('by slug:', await (Article as any).findBySlug?.('why-mongo-indexes-matter'));
