import { Product } from './models/Product';
import { restock, sell, addTag, setPrice } from './repositories/inventory';

await Product.create({ sku: 'kb-01', name: 'Keyboard', stock: 5, price: 89 });

// 10 buyers, 5 keyboards. How many sales go through?
const results = await Promise.all(Array.from({ length: 10 }, () => sell('KB-01', 1)));
console.log('sales:', results.filter(Boolean).length);
console.log('stock now:', (await Product.findOne({ sku: 'KB-01' }))?.stock);

console.log('after restock:', await restock('kb-01', 3));
console.log(await addTag('KB-01', 'Sale'));
try {
  await setPrice('KB-01', -1);
} catch (e) {
  console.log('rejected:', (e as Error).message);
}
