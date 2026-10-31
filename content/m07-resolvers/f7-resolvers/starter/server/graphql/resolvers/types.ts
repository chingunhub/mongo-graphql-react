// What every resolver receives as its 3rd argument. It grows in modules 8 and 9.
export interface Context {
  /** The logged-in user's document, or null. */
  currentUser: any | null;
}
