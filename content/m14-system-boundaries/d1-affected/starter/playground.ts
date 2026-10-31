import { affected } from './affected';
console.log(affected({ web: ['api'], api: ['contracts'], worker: ['contracts'], contracts: [] }, ['api']));
