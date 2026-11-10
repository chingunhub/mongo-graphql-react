import { portalIdentity } from './gateway';
import { createContext } from './plugin/context';
import { cpAccountQueries, cpTicketQueries } from './plugin/tickets';

export type ApiRequest = {
  operation: string;
  variables?: Record<string, unknown>;
  headers?: Record<string, string | undefined>;
  cookies?: Record<string, string | undefined>;
};
export type ApiResponse = { data?: unknown; errors?: { message: string }[] };

const operations = { ...cpAccountQueries, ...cpTicketQueries };

/** One request, the way it travels: through the gateway, then into the plugin. */
export async function handle(request: ApiRequest): Promise<ApiResponse> {
  const forwarded = { headers: { ...request.headers }, cookies: request.cookies };
  await portalIdentity(forwarded);

  const resolver = operations[request.operation];
  if (!resolver) return { errors: [{ message: `Unknown operation ${request.operation}` }] };
  try {
    return { data: await resolver(undefined, request.variables ?? {}, createContext(forwarded.headers)) };
  } catch (error) {
    return { errors: [{ message: (error as Error).message }] };
  }
}
