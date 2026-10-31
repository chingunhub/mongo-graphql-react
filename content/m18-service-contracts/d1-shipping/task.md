---
title: "Drill: a validated shipping procedure"
kind: "drill"
focus: ["router.ts"]
---

A shipping service quotes a parcel's cost. Callers include a web app, a warehouse script and whoever finds the URL, so every value gets checked.

## Your task

### `shippingRouter()` in `router.ts`

Create a real tRPC router with one query, `quote`.

**Input**, a strict Zod object:

- `kilograms`: a number, above 0 and at most 30.
- `destination`: `domestic` or `international`.

Unknown fields, wrong types, non-finite values and out-of-range values all fail with tRPC's `BAD_REQUEST`. Strings must not be coerced to numbers.

**Authentication:** if `ctx.accountId` is null, throw a `TRPCError` with `UNAUTHORIZED`.

**Cost:** round the weight up to a whole kilogram, then:

| Destination | Cost |
| --- | --- |
| domestic | 5 + kg × 2 |
| international | 12 + kg × 5 |

```ts
const caller = shippingRouter().createCaller({ accountId: 'a1' });

await caller.quote({ kilograms: 1.2, destination: 'domestic' });      // { cost: 9 }
await caller.quote({ kilograms: 30, destination: 'international' });  // { cost: 162 }
await caller.quote({ kilograms: '5', destination: 'domestic' });      // BAD_REQUEST
```

## Hints

### Parser before handler
Which method puts a schema in front of your query, so that the handler only sees valid data?

### Above zero
`min(0)` lets a zero-kilogram parcel through. Is there a Zod check that means "strictly greater"?

### Whose account?
The input doesn't mention an account, and it shouldn't. Where does a procedure find trusted values?

### Choosing the error
What does a caller see when you throw a plain `Error`, compared with a `TRPCError`?
