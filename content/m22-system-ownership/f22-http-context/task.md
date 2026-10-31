---
title: 'Relaydesk: own the HTTP identity adapter'
kind: forge
workspace: relaydesk
summary: 'Turn incoming headers into trusted context used by all three real HTTP transports.'
focus: ['services/http-context.ts']
readonly: ['runtime/auth.ts']
---

Every request to Relaydesk comes through one small function. The supplied `runtime/auth.ts` now delegates to yours, so REST, GraphQL and tRPC all stand on what you write here. If it's wrong, all three are wrong in the same way, and that's why it deserves this much care.

```viz-pipeline
{
  title: 'Strings in, trusted context out',
  color: 'gql',
  input: { label: 'Headers', docs: 'authorization, x-tenant, x-request-id', note: 'All untrusted. Any could be missing or the wrong shape.' },
  stages: [
    { label: 'Credential', code: 'Bearer <token>', note: 'Unknown means UNAUTHORIZED. Nothing else is looked at first.' },
    { label: 'Tenant', code: 'a non-empty string', note: 'A shape check. It proves nothing about membership.' },
    { label: 'Request ID', code: 'reuse, generate or reject', note: 'Strict, as it will be logged.' },
    { label: 'buildContext', code: 'your existing policy', note: 'Membership gets decided here, in one place.' },
  ],
}
```

## Your task

Implement `resolveHttpContext(headers, principals, newRequestId)` in `services/http-context.ts`. Never mutate `headers` or `principals`.

### 1. Credential, first

Accept exactly a **string** `authorization` value starting with `Bearer `, followed by a token that's an **own property** of `principals`. Anything else throws a `TRPCError` with `UNAUTHORIZED`.

### 2. Tenant

The selected tenant must be a non-empty string. Arrays and missing values throw `BAD_REQUEST`.

### 3. Request ID

It must be a string matching `^[A-Za-z0-9._:-]{1,128}$`. Call `newRequestId()` only when the header is absent, and validate that value too. A malformed one, supplied or generated, is rejected.

### 4. Policy

Call your existing `buildContext` to enforce membership. Return its fields, plus the original credential.

| `buildContext` failure | tRPC code |
| --- | --- |
| `UNAUTHENTICATED` | `UNAUTHORIZED` |
| `BAD_REQUEST` | `BAD_REQUEST` |
| `FORBIDDEN` | `FORBIDDEN` |
| Anything unexpected | rethrow it unchanged |

The grader checks ambiguous headers, inherited object properties, a foreign tenant, correlation and the whole running HTTP application.

### Before you submit

In the file explorer, trace both the gateway and a direct subgraph entry point. Could you explain to a teammate why checking only at the gateway isn't enough?

## Hints

### Check the type first
A check that the value `startsWith('Bearer ')` happens after what? Remember what the type says it could be.

### The token after the prefix
What should happen with `Bearer ` and nothing after it? How about `bearer x`?

### Where's your try?
Only the `buildContext` failures are being translated. How small can the `try` be? How do you recognize a failure you own?
