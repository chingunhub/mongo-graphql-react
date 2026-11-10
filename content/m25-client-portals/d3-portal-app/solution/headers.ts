/** The headers for one request: the portal's app token always, the customer's token when there is one. */
export function portalHeaders(appToken: string, authToken?: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'x-app-token': appToken };
  if (authToken) headers['client-auth-token'] = authToken;
  return headers;
}
