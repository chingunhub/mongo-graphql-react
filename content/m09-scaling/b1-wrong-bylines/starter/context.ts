import { createLoaders, type Loaders } from './loaders';

export interface Context {
  loaders: Loaders;
}

/** Called once per request. */
export function createContext(): Context {
  return { loaders: createLoaders() };
}
