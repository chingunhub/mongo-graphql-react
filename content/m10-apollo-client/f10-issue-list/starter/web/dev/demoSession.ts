// Preview helper (provided): logs into the reference API as the demo user and returns a token.
export async function demoLogin(uri = '/reference/graphql'): Promise<string | null> {
  try {
    const res = await fetch(uri, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: 'mutation DemoLogin($e: String!, $p: String!) { login(email: $e, password: $p) { token } }',
        variables: { e: 'ada@taskforge.dev', p: 'password123' },
      }),
    });
    const json = await res.json();
    return json?.data?.login?.token ?? null;
  } catch {
    return null;
  }
}
