import type { Loaders } from '../loaders';

// What every resolver receives as its 3rd argument.
export interface Context {
  /** The logged-in user's document, or null. */
  currentUser: any | null;
  /** Per-request DataLoaders. */
  loaders: Loaders;
}
