import { createLoaders, type Loaders } from './loaders';

export interface Context {
  loaders: Loaders;
}

/** Called once per request: fresh loaders, so caches never outlive a request. */
export function createContext(): Context {
  return { loaders: createLoaders() };
}
