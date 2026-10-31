import { Schema, type Model } from 'mongoose';
import type { IModels } from '../connectionResolvers';

export interface ISession {
  userId: string;
}
export type ISessionModel = Model<ISession>;

export const sessionSchema = new Schema<ISession>({
  userId: { type: String, required: true },
});

export const checkSession = async (models: IModels, userId: string) => {
  const session = await models.Sessions.findOne({ userId });
  if (!session) throw new Error('Login required');
};
