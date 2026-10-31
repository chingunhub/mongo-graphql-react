import { shippingRouter } from './router';
const caller = shippingRouter().createCaller({ accountId: 'a1' });
console.log(await caller.quote({ kilograms: 1.1, destination: 'domestic' }));
