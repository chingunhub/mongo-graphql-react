/** The headers for one request: the portal's app token always, the customer's token when there is one. */
export function portalHeaders(appToken: string, authToken?: string | null): Record<string, string> {
  throw new Error('TODO: build the headers');
}
