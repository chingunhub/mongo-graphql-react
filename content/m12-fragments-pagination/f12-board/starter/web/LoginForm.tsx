// Provided: a minimal login screen. It calls the `login` mutation you wrote in module 8.
import { useState } from 'react';

export function LoginForm({ uri, onLogin }: { uri: string; onLogin: (token: string) => void }) {
  const [email, setEmail] = useState('ada@taskforge.dev');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(uri, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query: 'mutation Login($email: String!, $password: String!) { login(email: $email, password: $password) { token } }',
          variables: { email, password },
        }),
      });
      const json = await res.json();
      const token = json?.data?.login?.token;
      if (token) onLogin(token);
      else setError(json?.errors?.[0]?.message ?? 'Login failed');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="tf-login" onSubmit={submit}>
      <h1>⚒ Taskforge</h1>
      <label>
        Email
        <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </label>
      <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      {error && <p role="alert">{error}</p>}
      <p className="tf-hint">Demo accounts: ada@, grace@, linus@, margaret@taskforge.dev — password123</p>
    </form>
  );
}
