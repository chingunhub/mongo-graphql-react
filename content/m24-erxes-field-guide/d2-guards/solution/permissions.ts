export type User = { _id: string; isOwner?: boolean; actions?: string[] };
export type Resolvers = Record<string, (root: any, args: any, context: any, info: any) => any>;
type Checker = (user?: User) => void;

export const checkLogin = (user?: User): void => {
  if (!user || !user._id) throw new Error('Login required');
};

export const can = (action: string, user?: User): boolean => {
  if (!user || !user._id) return false;
  if (user.isOwner === true) return true;
  return Array.isArray(user.actions) && user.actions.includes(action);
};

export const permissionWrapper = (cls: Resolvers, methodName: string, checkers: Checker[]): void => {
  const oldMethod = cls[methodName];
  cls[methodName] = async (root, args, context, info) => {
    for (const checker of checkers) checker(context.user);
    return oldMethod(root, args, context, info);
  };
};

export const requireLogin = (cls: Resolvers, methodName: string): void =>
  permissionWrapper(cls, methodName, [checkLogin]);

export const moduleRequireLogin = (mdl: Resolvers): void => {
  for (const method of Object.keys(mdl)) requireLogin(mdl, method);
};

export const checkPermission = (cls: Resolvers, methodName: string, action: string, defaultValue?: unknown): void => {
  const oldMethod = cls[methodName];
  cls[methodName] = async (root, args, context, info) => {
    checkLogin(context.user);
    if (!can(action, context.user)) {
      if (defaultValue !== undefined) return defaultValue;
      throw new Error('Permission required');
    }
    return oldMethod(root, args, context, info);
  };
};

export const moduleCheckPermission = (mdl: Resolvers, action: string, defaultValue?: unknown): void => {
  for (const method of Object.keys(mdl)) checkPermission(mdl, method, action, defaultValue);
};
