export type User = { _id: string; isOwner?: boolean; actions?: string[] };
export type Resolvers = Record<string, (root: any, args: any, context: any, info: any) => any>;
type Checker = (user?: User) => void;

export const checkLogin = (user?: User): void => {
  throw new Error('TODO: require a logged-in user');
};

export const can = (action: string, user?: User): boolean => {
  throw new Error('TODO: decide whether this user may do this');
};

export const permissionWrapper = (cls: Resolvers, methodName: string, checkers: Checker[]): void => {
  throw new Error('TODO: replace the method with a checked version');
};

export const requireLogin = (cls: Resolvers, methodName: string): void => {
  throw new Error('TODO');
};

export const moduleRequireLogin = (mdl: Resolvers): void => {
  throw new Error('TODO');
};

export const checkPermission = (cls: Resolvers, methodName: string, action: string, defaultValue?: unknown): void => {
  throw new Error('TODO');
};

export const moduleCheckPermission = (mdl: Resolvers, action: string, defaultValue?: unknown): void => {
  throw new Error('TODO');
};
