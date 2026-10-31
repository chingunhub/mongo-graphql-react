// From module 8 on, requests go through your own context.
import { buildContext } from '../server/graphql/context';

export const stageContext = ({ req }: { req: { headers: Record<string, string | string[] | undefined> } }) =>
  buildContext({ req });
