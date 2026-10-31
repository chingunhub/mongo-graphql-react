import { createContext } from './context';
const fetchRows = async (tenant: string) => [{ id: '7', title: tenant + ' record' }];
console.log(await createContext('north', fetchRows).loadRecord('7'));
console.log(await createContext('south', fetchRows).loadRecord('7'));
