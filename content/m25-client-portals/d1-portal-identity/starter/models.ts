// What core keeps about portals and their users, as two tiny in-memory models.
// `findOne` matches every field of the filter, like the Mongoose call it stands in for.

export type ClientPortal = { _id: string; name: string };
export type CPUser = { _id: string; clientPortalId: string; email: string; erxesCustomerId?: string };

export type Model<T> = { findOne(filter: Partial<T>): Promise<T | null> };
export type Models = { ClientPortals: Model<ClientPortal>; CPUsers: Model<CPUser> };

function model<T extends object>(rows: T[]): Model<T> {
  return {
    async findOne(filter) {
      const keys = Object.keys(filter) as (keyof T)[];
      return rows.find((row) => keys.every((key) => row[key] === filter[key])) ?? null;
    },
  };
}

export const createModels = (portals: ClientPortal[], users: CPUser[]): Models => ({
  ClientPortals: model(portals),
  CPUsers: model(users),
});
